import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsFacade } from './subscriptions.facade.js';
import { AuditModule } from '../audit/index.js';

@Module({
  imports: [AuditModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsFacade],
  exports: [SubscriptionsFacade, SubscriptionsService],
})
export class SubscriptionsModule {}
