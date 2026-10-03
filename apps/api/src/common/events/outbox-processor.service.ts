import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { outbox } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);

  constructor(private readonly dbService: DatabaseService) {}

  async processPendingEvents(): Promise<number> {
    const pending = await this.dbService.db
      .select()
      .from(outbox)
      .where(eq(outbox.status, 'pending'))
      .limit(50);

    for (const event of pending) {
      try {
        // Here events can be pushed to Kafka / RabbitMQ or external webhooks
        await this.dbService.db
          .update(outbox)
          .set({
            status: 'processed',
            processedAt: new Date(),
          })
          .where(eq(outbox.id, event.id));

        this.logger.debug(`Processed outbox event ${event.eventName} (${event.id})`);
      } catch (err: any) {
        this.logger.error(`Error processing outbox event ${event.id}: ${err.message}`);
        await this.dbService.db
          .update(outbox)
          .set({
            status: 'failed',
            error: err.message,
            retryCount: event.retryCount + 1,
          })
          .where(eq(outbox.id, event.id));
      }
    }

    return pending.length;
  }
}
