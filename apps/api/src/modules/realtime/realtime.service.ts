import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Response } from 'express';
import { EventBusService } from '../../common/events/event-bus.service.js';
import Redis from 'ioredis';

interface SseClient {
  id: string;
  userId: string;
  res: Response;
  lastEventId?: string;
}

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private clients: Map<string, SseClient> = new Map();
  private redisPub?: Redis;
  private redisSub?: Redis;
  private keepAliveInterval?: NodeJS.Timeout;

  constructor(@Inject(EventBusService) private readonly eventBus: EventBusService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redisPub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redisSub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

      this.redisPub.on('error', () => {});
      this.redisSub.on('error', () => {});

      await Promise.all([this.redisPub.connect(), this.redisSub.connect()]);

      await this.redisSub.subscribe('wasel:realtime:events');
      this.redisSub.on('message', (_channel, message) => {
        try {
          const parsed = JSON.parse(message);
          this.broadcastLocal(parsed.event, parsed.payload, parsed.targetUserId, parsed.eventId);
        } catch {
          // ignore
        }
      });
      this.logger.log('✅ Realtime Redis pub/sub connected');
    } catch {
      this.logger.warn('⚠️ Redis not available for SSE cross-instance fanout, falling back to local memory event bus');
    }

    // Subscribe to internal local event bus events
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
      this.eventBus.subscribe(ev, (data: any) => {
        const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const targetUserId = data.payload?.customerId || data.payload?.driverId || data.payload?.recipientId;

        // If redisPub is available, publish across instances
        if (this.redisPub?.status === 'ready') {
          this.redisPub.publish(
            'wasel:realtime:events',
            JSON.stringify({ event: ev, payload: data.payload, targetUserId, eventId }),
          ).catch(() => {});
        } else {
          this.broadcastLocal(ev, data.payload, targetUserId, eventId);
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

  addClient(clientId: string, userId: string, res: Response, lastEventId?: string) {
    this.clients.set(clientId, { id: clientId, userId, res, lastEventId });

    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, userId, timestamp: new Date().toISOString() })}\n\n`);

    res.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  private broadcastLocal(event: string, payload: any, targetUserId?: string, eventId?: string) {
    const sseFormatted = `id: ${eventId || `evt-${Date.now()}`}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      // If targetUserId is specified, deliver to that user or admins; else broadcast
      if (!targetUserId || client.userId === targetUserId) {
        try {
          client.res.write(sseFormatted);
        } catch {
          this.clients.delete(clientId);
        }
      }
    }
  }
}
