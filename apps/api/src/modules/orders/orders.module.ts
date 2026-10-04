import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersFacade } from './orders.facade.js';
import { AuditModule } from '../audit/index.js';
import { EventsModule } from '../../common/events/events.module.js';
import { SubscriptionsModule } from '../subscriptions/index.js';
import { VerificationModule } from '../verification/index.js';
import { S3StorageService } from '../../common/storage/s3-storage.service.js';

@Module({
  imports: [AuditModule, EventsModule, SubscriptionsModule, VerificationModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersFacade, S3StorageService],
  exports: [OrdersFacade, OrdersService],
})
export class OrdersModule {}
