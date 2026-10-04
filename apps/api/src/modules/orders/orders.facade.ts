import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { orders, stops } from '../../database/schema/index.js';
import { eq, asc } from 'drizzle-orm';

@Injectable()
export class OrdersFacade {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getOrderById(orderId: string) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const orderStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, orderId))
      .orderBy(asc(stops.seq));

    return {
      ...order,
      stops: orderStops,
    };
  }

  async updateOrderStatus(orderId: string, status: string, cancelReason?: string) {
    const [updated] = await this.dbService.db
      .update(orders)
      .set({
        status,
        ...(cancelReason ? { cancelReason } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    return updated;
  }
}
