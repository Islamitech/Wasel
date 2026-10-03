import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './database/database.module.js';
import { EventsModule } from './common/events/events.module.js';
import { SettingsModule } from './common/settings/settings.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { RegionsModule } from './modules/regions/regions.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { VerificationModule } from './modules/verification/verification.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { MatchingModule } from './modules/matching/matching.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { AgreementsModule } from './modules/agreements/agreements.module.js';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RatingsModule } from './modules/ratings/ratings.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { HealthModule } from './modules/health/health.module.js';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120, // 120 requests per minute
      },
    ]),
    DatabaseModule,
    EventsModule,
    SettingsModule,
    AuditModule,
    IdentityModule,
    RegionsModule,
    CatalogModule,
    VerificationModule,
    OrdersModule,
    MatchingModule,
    PricingModule,
    AgreementsModule,
    SubscriptionsModule,
    MessagingModule,
    NotificationsModule,
    RatingsModule,
    AdminModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
