import { Worker, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import * as http from 'http';
import * as dotenv from 'dotenv';
import { DatabaseService } from './database/database.service.js';
import { OutboxProcessorService } from './common/events/outbox-processor.service.js';
import { ExpiryService } from './common/events/expiry.service.js';
import { EventBusService } from './common/events/event-bus.service.js';
import { SettingsService } from './common/settings/settings.service.js';
import { MatchingFacade } from './modules/matching/matching.facade.js';

dotenv.config();

const logger = new Logger('WaselBackgroundWorker');

async function startWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redisHost = 'localhost:6379';
  try {
    const parsed = new URL(redisUrl);
    redisHost = parsed.host;
  } catch {
    redisHost = 'configured-host';
  }

  logger.log(`Connecting background worker to Redis host: ${redisHost}...`);

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  let redisAvailable = false;
  try {
    await connection.connect();
    redisAvailable = true;
    logger.log('✅ Connected to Redis successfully');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Redis connection failed (${msg}). Worker will operate in standalone database polling mode.`);
  }

  // 1. Initialize Database, Settings, EventBus, Expiry, and Outbox services
  const dbService = new DatabaseService();
  await dbService.onModuleInit();
  const settingsService = new SettingsService(dbService);
  const eventBus = new EventBusService(dbService);
  const expiryService = new ExpiryService(dbService, eventBus);
  const outboxProcessor = new OutboxProcessorService(dbService, settingsService);
  const matchingFacade = new MatchingFacade(dbService);

  // 2. Register domain event dispatch handlers
  outboxProcessor.registerHandler('order.created', async (event) => {
    logger.debug(`[DISPATCH] order.created -> notifying matching engine (orderId: ${event.aggregateId})`);
  });

  outboxProcessor.registerHandler('order.published', async (event) => {
    logger.debug(`[DISPATCH] order.published -> calculating eligible drivers (orderId: ${event.aggregateId})`);
    try {
      const eligibleDrivers = await matchingFacade.findEligibleDrivers(event.aggregateId);
      logger.log(`Found ${eligibleDrivers.length} eligible drivers for published order ${event.aggregateId}`);
      if (eligibleDrivers.length > 0 && redisAvailable) {
        const driverIds = eligibleDrivers.map((d) => d.driverId);
        const sseEvent = JSON.stringify({
          event: 'order.published',
          payload: { orderId: event.aggregateId, candidatesCount: eligibleDrivers.length },
          recipients: driverIds,
          eventId: `evt-outbox-${event.id}`,
        });
        await connection.publish('wasel:realtime:events', sseEvent);
      }
    } catch (err) {
      logger.error(`Failed to dispatch order.published outbox event: ${err}`);
    }
  });

  outboxProcessor.registerHandler('order.cancelled', async (event) => {
    logger.debug(`[DISPATCH] order.cancelled -> notifying participants (orderId: ${event.aggregateId})`);
  });

  outboxProcessor.registerHandler('agreement.created', async (event) => {
    logger.debug(`[DISPATCH] agreement.created -> locking dispatch and notifying parties (agreementId: ${event.aggregateId})`);
  });

  outboxProcessor.registerHandler('order.expired', async (event) => {
    logger.debug(`[DISPATCH] order.expired -> broadcasting cancellation to waiting drivers (orderId: ${event.aggregateId})`);
  });

  outboxProcessor.registerHandler('offer.expired', async (event) => {
    logger.debug(`[DISPATCH] offer.expired -> notifying driver of expired quotation (offerId: ${event.aggregateId})`);
  });

  outboxProcessor.registerHandler('subscription.expired', async (event) => {
    logger.debug(`[DISPATCH] subscription.expired -> disabling driver radar (driverId: ${event.aggregateId})`);
  });

  let scheduledQueue: Queue | null = null;
  let scheduledWorker: Worker | null = null;
  const fallbackIntervals: NodeJS.Timeout[] = [];

  if (redisAvailable) {
    // 3a. BullMQ Distributed Scheduler (ADR 0005)
    scheduledQueue = new Queue('wasel-scheduled-tasks', { connection });

    // Register repeatable jobs
    await scheduledQueue.add('outbox-dispatch', {}, { repeat: { every: 5000 }, removeOnComplete: true });
    await scheduledQueue.add('order-expiry', {}, { repeat: { every: 60000 }, removeOnComplete: true });
    await scheduledQueue.add('offer-expiry', {}, { repeat: { every: 30000 }, removeOnComplete: true });
    await scheduledQueue.add('subscription-expiry', {}, { repeat: { every: 300000 }, removeOnComplete: true });
    await scheduledQueue.add('outbox-cleanup', {}, { repeat: { every: 86400000 }, removeOnComplete: true });

    scheduledWorker = new Worker(
      'wasel-scheduled-tasks',
      async (job) => {
        switch (job.name) {
          case 'outbox-dispatch':
            return { processed: await outboxProcessor.processPendingEvents() };
          case 'order-expiry':
            return { expiredOrders: await expiryService.expireOrders() };
          case 'offer-expiry':
            return { expiredOffers: await expiryService.expireOffers() };
          case 'subscription-expiry':
            return { expiredSubscriptions: await expiryService.expireSubscriptions() };
          case 'outbox-cleanup':
            return { cleaned: await outboxProcessor.cleanOldProcessedEvents() };
          default:
            logger.warn(`Unknown job received: ${job.name}`);
            return {};
        }
      },
      { connection, concurrency: 5 },
    );

    scheduledWorker.on('failed', (job, err) => {
      logger.error(`Job ${job?.name} (${job?.id}) failed: ${err.message}`);
    });

    logger.log('🚀 BullMQ Distributed Scheduler active with repeatable background tasks');
  } else {
    // 3b. Standalone fallback polling intervals when Redis is not available
    fallbackIntervals.push(
      setInterval(async () => {
        try {
          await outboxProcessor.processPendingEvents();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Outbox polling error: ${msg}`);
        }
      }, 5000),
    );

    fallbackIntervals.push(
      setInterval(async () => {
        try {
          await expiryService.expireOrders();
          await expiryService.expireOffers();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Expiry polling error: ${msg}`);
        }
      }, 30000),
    );

    fallbackIntervals.push(
      setInterval(async () => {
        try {
          await expiryService.expireSubscriptions();
          await outboxProcessor.cleanOldProcessedEvents();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Subscription/cleanup polling error: ${msg}`);
        }
      }, 300000),
    );

    logger.log('⏱️ Standalone database interval polling active');
  }

  // 4. Lightweight HTTP Health Check Server
  const healthPort = Number(process.env.WORKER_PORT || 3001);
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'wasel-worker',
          redisConnected: connection.status === 'ready',
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  healthServer.listen(healthPort, () => {
    logger.log(`🩺 Worker health check listening on http://localhost:${healthPort}/health`);
  });

  // 5. Graceful Shutdown Handlers
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log(`Received ${signal}. Shutting down worker gracefully...`);

    healthServer.close();
    for (const interval of fallbackIntervals) {
      clearInterval(interval);
    }

    if (scheduledWorker) {
      await scheduledWorker.close();
    }
    if (scheduledQueue) {
      await scheduledQueue.close();
    }
    await dbService.onModuleDestroy();
    if (connection.status === 'ready') {
      await connection.quit();
    }

    logger.log('✅ Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startWorker().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal: Worker failed to start: ${msg}`);
  process.exit(1);
});
