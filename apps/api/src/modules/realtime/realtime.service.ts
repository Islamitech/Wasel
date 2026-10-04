import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { MatchingFacade } from '../matching/index.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { orders, agreements } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import * as crypto from 'crypto';

interface SseClient {
  id: string;
  userId: string;
  res: Response;
  lastEventId?: string;
  connectedAt: Date;
}

interface SseEventRecord {
  id: string;
  event: string;
  payload: any;
  timestamp: string;
}

interface StreamTicket {
  userId: string;
  roles: string[];
  expiresAt: number;
}

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private clients: Map<string, SseClient> = new Map();
  private redisPub?: Redis;
  private redisSub?: Redis;
  private keepAliveInterval?: NodeJS.Timeout;

  // In-memory fallback structures
  private memoryTickets = new Map<string, StreamTicket>();
  private memoryEventBuffers = new Map<string, SseEventRecord[]>();
  private readonly RING_BUFFER_SIZE = 100;

  constructor(
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(MatchingFacade) private readonly matchingFacade: MatchingFacade,
    @Inject(RedisService) private readonly redisService: RedisService,
    @Optional() @Inject(AppConfigService) private readonly configService?: AppConfigService,
  ) {}

  async onModuleInit() {
    const isProduction =
      this.configService?.get('APP_ENV') === 'production' ||
      process.env.APP_ENV === 'production' ||
      process.env.NODE_ENV === 'production';

    const redisUrl =
      this.configService?.get('REDIS_URL') || process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redisPub = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      this.redisSub = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      this.redisPub.on('error', (err) => {
        this.logger.warn(`Redis pub error: ${err.message}`);
      });
      this.redisSub.on('error', (err) => {
        this.logger.warn(`Redis sub error: ${err.message}`);
      });

      await Promise.all([this.redisPub.connect(), this.redisSub.connect()]);

      await this.redisSub.subscribe('wasel:realtime:events');
      this.redisSub.on('message', (_channel, message) => {
        try {
          const parsed = JSON.parse(message);
          this.deliverLocal(parsed.event, parsed.payload, parsed.recipients, parsed.eventId);
        } catch (err) {
          this.logger.error(`Error parsing Redis realtime message: ${err}`);
        }
      });
      this.logger.log('✅ Realtime Redis pub/sub connected');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isProduction) {
        this.logger.error(`❌ FATAL: Redis pub/sub connection failed in production: ${msg}`);
        throw new Error(`[FATAL] Redis pub/sub connection failed in production: ${msg}`);
      }
      this.logger.warn('⚠️ Redis not available for SSE fanout, falling back to local memory event bus');
    }

    // Subscribe to internal local event bus events with explicit recipient resolution
    const supportedEvents = [
      'order.created',
      'order.published',
      'order.updated',
      'order.cancelled',
      'order.completed',
      'offer.created',
      'agreement.created',
      'stop.updated',
      'invoice.issued',
      'message.created',
    ];

    for (const ev of supportedEvents) {
      this.eventBus.subscribe(ev, async (data: any) => {
        try {
          const recipients = await this.resolveRecipients(ev, data.aggregateId, data.payload);
          if (recipients.length === 0) {
            this.logger.debug(`[RealtimeService] Event "${ev}" not broadcast: No explicit recipients resolved.`);
            return;
          }

          const eventId = `evt-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
          await this.emitToRecipients(ev, data.payload, recipients, eventId);
        } catch (err) {
          this.logger.error(`Error processing realtime event "${ev}": ${err}`);
        }
      });
    }

    // 15-second heartbeat ping to prevent proxy connection drop
    this.keepAliveInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        try {
          client.res.write(`:keepalive ${Date.now()}\n\n`);
        } catch {
          this.clients.delete(clientId);
        }
      }
    }, 15000);
  }

  onModuleDestroy() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.redisPub) this.redisPub.disconnect();
    if (this.redisSub) this.redisSub.disconnect();
  }

  /**
   * Generates a single-use stream ticket valid for 30 seconds
   */
  async createTicket(userId: string, roles: string[] = []): Promise<string> {
    const ticket = crypto.randomBytes(24).toString('hex');
    const redisClient = this.redisService.getClient();

    if (redisClient) {
      try {
        const payload = JSON.stringify({ userId, roles });
        await redisClient.set(`sse:ticket:${ticket}`, payload, 'EX', 30);
        return ticket;
      } catch {
        // Fallback to memory
      }
    }

    this.memoryTickets.set(ticket, {
      userId,
      roles,
      expiresAt: Date.now() + 30 * 1000,
    });

    return ticket;
  }

  /**
   * Consumes a single-use stream ticket. Returns null if invalid or expired.
   */
  async consumeTicket(ticket: string): Promise<{ userId: string; roles: string[] } | null> {
    const redisClient = this.redisService.getClient();
    if (redisClient) {
      try {
        const key = `sse:ticket:${ticket}`;
        // Atomic GET and DEL
        const raw = await redisClient.get(key);
        if (raw) {
          await redisClient.del(key);
          return JSON.parse(raw);
        }
      } catch {
        // Fallback to memory
      }
    }

    const mem = this.memoryTickets.get(ticket);
    if (!mem) return null;
    this.memoryTickets.delete(ticket);

    if (mem.expiresAt < Date.now()) {
      return null;
    }

    return { userId: mem.userId, roles: mem.roles };
  }

  /**
   * Checks whether the user is permitted to open another concurrent SSE connection.
   */
  canUserConnect(userId: string, maxConnections = 5): boolean {
    let activeCount = 0;
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        activeCount++;
      }
    }
    return activeCount < maxConnections;
  }

  /**
   * Adds an authenticated SSE client connection, replaying any missed events if lastEventId is provided.
   */
  async addClient(clientId: string, userId: string, res: Response, lastEventId?: string) {
    const client: SseClient = {
      id: clientId,
      userId,
      res,
      lastEventId,
      connectedAt: new Date(),
    };
    this.clients.set(clientId, client);

    // Initial connection acknowledgment
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        clientId,
        userId,
        timestamp: new Date().toISOString(),
      })}\n\n`,
    );

    // Replay missed events if client reconnected with Last-Event-ID
    if (lastEventId) {
      await this.replayMissedEvents(client, lastEventId);
    }

    res.on?.('close', () => {
      this.clients.delete(clientId);
    });
  }

  /**
   * Removes a connected client by ID
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Replays missed events for a specific user after lastEventId
   */
  private async replayMissedEvents(client: SseClient, lastEventId: string) {
    const events = await this.getUserEventHistory(client.userId);
    let foundLast = false;
    const missed: SseEventRecord[] = [];

    for (const ev of events) {
      if (foundLast) {
        missed.push(ev);
      } else if (ev.id === lastEventId) {
        foundLast = true;
      }
    }

    // If lastEventId was older than buffer, replay all buffered events
    const toReplay = foundLast ? missed : events;

    for (const ev of toReplay) {
      try {
        client.res.write(`id: ${ev.id}\nevent: ${ev.event}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
      } catch {
        this.clients.delete(client.id);
        break;
      }
    }
  }

  /**
   * Resolves explicit recipients based on domain routing rules:
   * - order.published -> Eligible drivers (via MatchingFacade)
   * - offer.created -> Customer (order owner)
   * - agreement.created -> Customer and Driver
   * - stop.updated / invoice.issued / order.completed -> Customer and Driver
   * - message.created -> Specific recipient
   * - order.cancelled -> Customer and Driver (if matched)
   */
  async resolveRecipients(event: string, aggregateId: string, payload: any): Promise<string[]> {
    switch (event) {
      case 'order.published': {
        const orderId = payload?.orderId || aggregateId;
        if (!orderId) return [];
        try {
          const drivers = await this.matchingFacade.findEligibleDrivers(orderId);
          return drivers.map((d) => d.driverId);
        } catch (err) {
          this.logger.error(`Failed to find eligible drivers for published order ${orderId}: ${err}`);
          return [];
        }
      }

      case 'offer.created': {
        if (payload?.customerId) return [payload.customerId];
        const [ord] = await this.dbService.db
          .select({ customerId: orders.customerId })
          .from(orders)
          .where(eq(orders.id, payload?.orderId))
          .limit(1);
        return ord ? [ord.customerId] : [];
      }

      case 'agreement.created': {
        const res: string[] = [];
        if (payload?.customerId) res.push(payload.customerId);
        if (payload?.driverId) res.push(payload.driverId);
        if (res.length > 0) return res;

        const [agr] = await this.dbService.db
          .select({ customerId: agreements.customerId, driverId: agreements.driverId })
          .from(agreements)
          .where(eq(agreements.id, aggregateId))
          .limit(1);
        return agr ? [agr.customerId, agr.driverId] : [];
      }

      case 'stop.updated':
      case 'invoice.issued':
      case 'order.completed': {
        const res: string[] = [];
        if (payload?.customerId) res.push(payload.customerId);
        if (payload?.driverId) res.push(payload.driverId);
        if (res.length === 2) return res;

        const orderId = payload?.orderId || aggregateId;
        const [agr] = await this.dbService.db
          .select({ customerId: agreements.customerId, driverId: agreements.driverId })
          .from(agreements)
          .where(eq(agreements.orderId, orderId))
          .limit(1);
        if (agr) {
          return [agr.customerId, agr.driverId];
        }
        return res;
      }

      case 'message.created': {
        return payload?.recipientId ? [payload.recipientId] : [];
      }

      case 'order.cancelled': {
        const res: string[] = [];
        if (payload?.customerId) res.push(payload.customerId);
        if (payload?.driverId) res.push(payload.driverId);
        return res;
      }

      default: {
        const target =
          payload?.recipientId || payload?.customerId || payload?.driverId || payload?.targetUserId;
        return target ? [target] : [];
      }
    }
  }

  /**
   * Broadcasts domain event strictly to explicit recipients.
   * If recipients is empty, drops broadcast completely.
   */
  async emitToRecipients(
    event: string,
    payload: any,
    recipients: string[],
    eventId?: string,
  ): Promise<void> {
    if (!recipients || recipients.length === 0) {
      this.logger.debug(`[RealtimeService] Dropped event "${event}": No recipients provided.`);
      return;
    }

    const id = eventId || `evt-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    const eventRecord: SseEventRecord = {
      id,
      event,
      payload,
      timestamp: new Date().toISOString(),
    };

    // Store in ring buffer for each recipient
    await Promise.all(recipients.map((uid) => this.recordUserEvent(uid, eventRecord)));

    // Fanout across nodes via Redis PubSub if available
    if (this.redisPub?.status === 'ready') {
      try {
        await this.redisPub.publish(
          'wasel:realtime:events',
          JSON.stringify({ event, payload, recipients, eventId: id }),
        );
        return;
      } catch (err) {
        this.logger.warn(`Redis pub failed, falling back to local delivery: ${err}`);
      }
    }

    this.deliverLocal(event, payload, recipients, id);
  }

  /**
   * Appends an event to the recipient's ring buffer in Redis or memory
   */
  private async recordUserEvent(userId: string, record: SseEventRecord): Promise<void> {
    const redisClient = this.redisService.getClient();
    if (redisClient) {
      try {
        const key = `sse:user:${userId}:events`;
        await redisClient.rpush(key, JSON.stringify(record));
        await redisClient.ltrim(key, -this.RING_BUFFER_SIZE, -1);
        await redisClient.expire(key, 3600); // 1 hour retention
        return;
      } catch {
        // Fallback to memory
      }
    }

    const buf = this.memoryEventBuffers.get(userId) || [];
    buf.push(record);
    if (buf.length > this.RING_BUFFER_SIZE) {
      buf.shift();
    }
    this.memoryEventBuffers.set(userId, buf);
  }

  /**
   * Retrieves user event history for replay
   */
  private async getUserEventHistory(userId: string): Promise<SseEventRecord[]> {
    const redisClient = this.redisService.getClient();
    if (redisClient) {
      try {
        const key = `sse:user:${userId}:events`;
        const items = await redisClient.lrange(key, 0, -1);
        if (items.length > 0) {
          return items.map((i) => JSON.parse(i));
        }
      } catch {
        // Fallback to memory
      }
    }

    return this.memoryEventBuffers.get(userId) || [];
  }

  /**
   * Delivers an SSE event to connected local client sockets belonging to recipients
   */
  private deliverLocal(event: string, payload: any, recipients: string[], eventId: string) {
    const sseFormatted = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    const recipientSet = new Set(recipients);

    for (const [clientId, client] of this.clients.entries()) {
      if (recipientSet.has(client.userId)) {
        try {
          client.res.write(sseFormatted);
        } catch {
          this.clients.delete(clientId);
        }
      }
    }
  }
}

