import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService, type DatabaseTransaction } from '../../database/database.service.js';
import { outbox } from '../../database/schema/index.js';
import { EventEmitter } from 'events';

export interface DomainEvent<T = unknown> {
  eventName: string;
  aggregateId: string;
  payload: T;
  timestamp: Date;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();

  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  /**
   * Publish a domain event using the Transactional Outbox pattern.
   * Inserts the event into the outbox table within the provided transaction,
   * and dispatches to in-process listeners ONLY after the transaction commits.
   */
  async publish<T extends Record<string, unknown>>(
    tx: DatabaseTransaction,
    eventName: string,
    aggregateId: string,
    payload: T,
  ): Promise<void>;
  async publish<T extends Record<string, unknown>>(
    eventName: string,
    aggregateId: string,
    payload: T,
  ): Promise<void>;
  async publish<T extends Record<string, unknown>>(
    first: DatabaseTransaction | string,
    second: string,
    third: string | T,
    fourth?: T,
  ): Promise<void> {
    let tx: DatabaseTransaction | undefined;
    let eventName: string;
    let aggregateId: string;
    let payload: T;

    if (typeof first === 'string') {
      tx = undefined;
      eventName = first;
      aggregateId = second;
      payload = third as T;
    } else {
      tx = first;
      eventName = second;
      aggregateId = third as string;
      payload = fourth!;
    }

    try {
      const dbTarget = tx || this.dbService.db;
      await dbTarget.insert(outbox).values({
        eventName,
        aggregateId,
        payload,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
      });

      this.logger.log(`📢 Domain event staged in outbox: ${eventName} (aggregate: ${aggregateId})`);

      const emitLocal = () => {
        this.logger.log(`📢 Domain event dispatched after commit: ${eventName} (aggregate: ${aggregateId})`);
        this.emitter.emit(eventName, { eventName, aggregateId, payload, timestamp: new Date() });
      };

      if (tx && typeof tx._afterCommit === 'function') {
        tx._afterCommit(emitLocal);
      } else {
        emitLocal();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to record domain event ${eventName} to outbox: ${msg}`);
      throw err;
    }
  }

  /**
   * Subscribe an in-process listener for domain events
   */
  subscribe<T = unknown>(eventName: string, handler: (event: DomainEvent<T>) => Promise<void> | void): void {
    this.emitter.on(eventName, async (data: DomainEvent<T>) => {
      try {
        await handler(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error in domain event handler for ${eventName}: ${msg}`);
      }
    });
  }
}
