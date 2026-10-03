import { Module } from '@nestjs/common';
import { SubscriptionsFacade } from './subscriptions.facade.js';

@Module({
  providers: [SubscriptionsFacade],
  exports: [SubscriptionsFacade],
})
export class SubscriptionsModule {}
