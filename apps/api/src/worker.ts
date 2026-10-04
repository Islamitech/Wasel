import { Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import { DatabaseService } from './database/database.service.js';
import { OutboxProcessorService } from './common/events/outbox-processor.service.js';

dotenv.config();

const logger = new Logger('BullMQWorker');

async function startWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redisHost = 'localhost:6379';
  try {
    const parsed = new URL(redisUrl);
    redisHost = parsed.host;
  } catch {
    redisHost = 'configured-host';
  }

  logger.log(`Connecting BullMQ Worker to Redis host: ${redisHost}...`);

  const connection = new (IORedis as any)(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  try {
    await connection.connect();
    logger.log('✅ BullMQ connected to Redis successfully');
  } catch (err: any) {
    logger.warn(`Redis connection failed (${err.message}). Worker will operate in polling mode.`);
  }

  // Initialize database and outbox processor
  const dbService = new DatabaseService();
  await dbService.onModuleInit();
  const outboxProcessor = new OutboxProcessorService(dbService);

  // BullMQ Worker for background jobs
  const outboxWorker = new Worker(
    'outbox-queue',
    async (job) => {
      logger.log(`Processing job ${job.name} (${job.id})`);
      const count = await outboxProcessor.processPendingEvents();
      return { processedEvents: count };
    },
    { connection },
  );

  outboxWorker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed`);
  });

  outboxWorker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  // Standing interval polling outbox table every 5 seconds as fallback
  const intervalId = setInterval(async () => {
    try {
      await outboxProcessor.processPendingEvents();
    } catch (err: any) {
      logger.error(`Outbox polling error: ${err.message}`);
    }
  }, 5000);

  logger.log('👷 Wasel Background Worker running and listening for jobs...');

  // Graceful shutdown
  const shutdown = async () => {
    logger.log('Shutting down background worker gracefully...');
    clearInterval(intervalId);
    await outboxWorker.close();
    await dbService.onModuleDestroy();
    if (connection.status === 'ready') {
      await connection.quit();
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startWorker().catch((err) => {
  logger.error('Worker failed to start:', err);
  process.exit(1);
});
