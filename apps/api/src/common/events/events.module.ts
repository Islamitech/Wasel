import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service.js';
import { OutboxProcessorService } from './outbox-processor.service.js';
import { ExpiryService } from './expiry.service.js';

@Global()
@Module({
  providers: [EventBusService, OutboxProcessorService, ExpiryService],
  exports: [EventBusService, OutboxProcessorService, ExpiryService],
})
export class EventsModule {}
