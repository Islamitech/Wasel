import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingFacade } from './messaging.facade.js';
import { EventsModule } from '../../common/events/events.module.js';

@Module({
  imports: [EventsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingFacade],
  exports: [MessagingFacade, MessagingService],
})
export class MessagingModule {}
