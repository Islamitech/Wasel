import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { outbox, type OutboxRecord } from '../../database/schema/index.js';
import { sql, inArray, eq } from 'drizzle-orm';
import { SettingsService } from '../settings/settings.service.js';

export type OutboxEventHandler = (event: OutboxRecord) => Promise<void>;

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly handlers = new Map<string, OutboxEventHandler[]>();

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
  ) {}

  /**
   * Register a domain event handler. Multiple handlers may register for the same eventName.
   */
  registerHandler(eventName: string, handler: OutboxEventHandler): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
    this.logger.log(`Registered handler for outbox event: "${eventName}"`);
  }

  /**
   * Process pending outbox events using ACID row-level locking (SELECT ... FOR UPDATE SKIP LOCKED).
   * Safely handles parallel processing across multiple worker processes without duplicate execution.
   */
  async processBatch(batchSize: number = 20): Promise<number> {
    return this.processPendingEvents(batchSize);
  }

  async processPendingEvents(batchSize: number = 20): Promise<number> {
    // 1. Lock and claim next batch atomically
    const batch = await this.dbService.transaction(async (tx) => {
      const rows = await tx.execute<{
        id: string;
        event_name: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        status: string;
        retry_count: number;
        attempts: number;
        next_attempt_at: string;
        created_at: string;
      }>(sql`
        SELECT id, event_name, aggregate_id, payload, status, retry_count, attempts, next_attempt_at, created_at
        FROM app.outbox
        WHERE status = 'pending'
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);

      const rawEvents: Array<{
        id: string;
        event_name: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        status: string;
        retry_count: number;
        attempts: number;
        next_attempt_at: string;
        created_at: string;
      }> = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows || [];

      if (rawEvents.length === 0) {
        return [];
      }

      const ids = rawEvents.map((r) => r.id);
      await tx
        .update(outbox)
        .set({
          status: 'processing',
          lockedAt: new Date(),
        })
        .where(inArray(outbox.id, ids));

      return rawEvents.map((r): OutboxRecord => ({
        id: r.id,
        eventName: r.event_name,
        aggregateId: r.aggregate_id,
        payload: r.payload,
        status: 'processing',
        retryCount: r.retry_count,
        attempts: r.attempts,
        nextAttemptAt: new Date(r.next_attempt_at),
        lockedAt: new Date(),
        error: null,
        createdAt: new Date(r.created_at),
        processedAt: null,
      }));
    }, { actor: 'system' });

    if (batch.length === 0) {
      return 0;
    }

    const maxAttempts = await this.settingsService.getOutboxMaxAttempts();

    // 2. Dispatch claimed events to registered handlers
    for (const event of batch) {
      const handlers = this.handlers.get(event.eventName) || [];
      try {
        for (const handler of handlers) {
          await handler(event);
        }

        // Mark as processed successfully
        await this.dbService.db
          .update(outbox)
          .set({
            status: 'processed',
            processedAt: new Date(),
            lockedAt: null,
            error: null,
          })
          .where(eq(outbox.id, event.id));

        this.logger.debug(`✅ Outbox event processed: ${event.eventName} (${event.id})`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const currentAttempts = (event.attempts || 0) + 1;

        if (currentAttempts >= maxAttempts) {
          // Transition to dead letter
          await this.dbService.db
            .update(outbox)
            .set({
              status: 'dead',
              attempts: currentAttempts,
              retryCount: currentAttempts,
              error: errorMsg,
              lockedAt: null,
            })
            .where(eq(outbox.id, event.id));
          this.logger.error(`🚨 Outbox event ${event.id} (${event.eventName}) DEAD after ${currentAttempts} attempts: ${errorMsg}`);
        } else {
          // Exponential backoff: 2 ^ attempts * 5 seconds (5s, 10s, 20s, 40s...)
          const delaySeconds = Math.pow(2, currentAttempts) * 5;
          const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
          await this.dbService.db
            .update(outbox)
            .set({
              status: 'pending',
              attempts: currentAttempts,
              retryCount: currentAttempts,
              nextAttemptAt,
              error: errorMsg,
              lockedAt: null,
            })
            .where(eq(outbox.id, event.id));
          this.logger.warn(`⚠️ Outbox event ${event.id} failed attempt ${currentAttempts}/${maxAttempts}. Retry in ${delaySeconds}s: ${errorMsg}`);
        }
      }
    }

    return batch.length;
  }

  /**
   * Retention cleanup policy: deletes processed outbox events older than configured retention days.
   */
  async cleanOldProcessedEvents(): Promise<number> {
    const retentionDays = await this.settingsService.getOutboxRetentionDays();
    const res = await this.dbService.db.execute<{ id: string }>(sql`
      DELETE FROM app.outbox
      WHERE status = 'processed'
        AND processed_at < now() - (${retentionDays} || ' days')::interval
      RETURNING id
    `);

    const deletedRows = Array.isArray(res) ? res : (res as unknown as { rows: typeof res }).rows || [];
    const count = deletedRows.length;
    if (count > 0) {
      this.logger.log(`🧹 Purged ${count} processed outbox record(s) older than ${retentionDays} days`);
    }
    return count;
  }
}
