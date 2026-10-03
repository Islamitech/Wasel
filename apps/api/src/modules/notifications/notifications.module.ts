import { Module } from '@nestjs/common';
import { NotificationsFacade } from './notifications.facade.js';

@Module({
  providers: [NotificationsFacade],
  exports: [NotificationsFacade],
})
export class NotificationsModule {}
