import { Module } from '@nestjs/common';
import { MessagingFacade } from './messaging.facade.js';

@Module({
  providers: [MessagingFacade],
  exports: [MessagingFacade],
})
export class MessagingModule {}
