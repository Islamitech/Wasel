import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { outbox } from '../../database/schema/index.js';
import { EventEmitter } from 'events';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();

  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  /**
   * Publish a domain event using the Transactional Outbox pattern.
   * Inserts the event into the outbox table for reliable processing.
   */
  async publish<T extends Record<string, unknown>>(
    eventName: string,
    aggregateId: string,
    payload: T,
  ): Promise<void> {
    try {
      await this.dbService.db.insert(outbox).values({
        eventName,
        aggregateId,
        payload,
        status: 'pending',
      });

      this.logger.log(`📢 Domain event written to outbox: ${eventName} (aggregate: ${aggregateId})`);

      // Emit locally for immediate in-process observers
      this.emitter.emit(eventName, { eventName, aggregateId, payload, timestamp: new Date() });
    } catch (err: any) {
      this.logger.error(`Failed to record domain event ${eventName} to outbox: ${err.message}`);
      throw err;
    }
  }

  /**
   * Subscribe an in-process listener for domain events
   */
  subscribe(eventName: string, handler: (event: any) => Promise<void> | void): void {
    this.emitter.on(eventName, async (data) => {
      try {
        await handler(data);
      } catch (err: any) {
        this.logger.error(`Error in domain event handler for ${eventName}: ${err.message}`);
      }
    });
  }
}
