import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsFacade } from './notifications.facade.js';
import { PUSH_PROVIDER_TOKEN } from '../../common/providers/push/push.provider.interface.js';
import { DevPushProvider } from '../../common/providers/push/dev-push.provider.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsFacade,
    {
      provide: PUSH_PROVIDER_TOKEN,
      useClass: DevPushProvider,
    },
  ],
  exports: [NotificationsFacade, NotificationsService],
})
export class NotificationsModule {}
