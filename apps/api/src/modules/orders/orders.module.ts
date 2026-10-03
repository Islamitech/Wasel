import { Module } from '@nestjs/common';
import { OrdersFacade } from './orders.facade.js';

@Module({
  providers: [OrdersFacade],
  exports: [OrdersFacade],
})
export class OrdersModule {}
