import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';
import { OutboxProcessorService } from './outbox-processor.service.js';

@Global()
@Module({
  providers: [EventBusService, OutboxProcessorService],
  exports: [EventBusService, OutboxProcessorService],
})
export class EventsModule {}
