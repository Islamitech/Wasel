import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsFacade } from './subscriptions.facade.js';
import { AuditModule } from '../audit/index.js';
import { PaymobPaymentProvider, PAYMENT_PROVIDER_TOKEN } from '../../common/providers/payment/index.js';

@Module({
  imports: [AuditModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionsFacade,
    PaymobPaymentProvider,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useClass: PaymobPaymentProvider,
    },
  ],
  exports: [SubscriptionsFacade, SubscriptionsService],
})
export class SubscriptionsModule {}
