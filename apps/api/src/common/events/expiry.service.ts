import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { orders, offers, subscriptions } from '../../database/schema/index.js';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { EventBusService } from './event-bus.service.js';

@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
  ) {}

  /**
   * Transitions published, matching, or offers_received orders past their expires_at into 'expired'.
   * Publishes 'order.expired' to outbox within the same transaction.
   */
  async expireOrders(): Promise<number> {
    return this.dbService.transaction(async (tx) => {
      const now = new Date();
      const expired = await tx
        .update(orders)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            inArray(orders.status, ['published', 'matching', 'offers_received']),
            lt(orders.expiresAt, now),
          ),
        )
        .returning({
          id: orders.id,
          customerId: orders.customerId,
          regionId: orders.regionId,
        });

      for (const ord of expired) {
        await this.eventBus.publish(tx, 'order.expired', ord.id, {
          orderId: ord.id,
          customerId: ord.customerId,
          regionId: ord.regionId,
          expiredAt: now.toISOString(),
        });
      }

      if (expired.length > 0) {
        this.logger.log(`⏰ Expired ${expired.length} stale order(s)`);
      }
      return expired.length;
    }, { actor: 'system' });
  }

  /**
   * Transitions pending offers past their expires_at into 'expired'.
   * Publishes 'offer.expired' to outbox within the same transaction.
   */
  async expireOffers(): Promise<number> {
    return this.dbService.transaction(async (tx) => {
      const now = new Date();
      const expired = await tx
        .update(offers)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(offers.status, 'pending'),
            lt(offers.expiresAt, now),
          ),
        )
        .returning({
          id: offers.id,
          orderId: offers.orderId,
          driverId: offers.driverId,
        });

      for (const off of expired) {
        await this.eventBus.publish(tx, 'offer.expired', off.id, {
          offerId: off.id,
          orderId: off.orderId,
          driverId: off.driverId,
          expiredAt: now.toISOString(),
        });
      }

      if (expired.length > 0) {
        this.logger.log(`⏰ Expired ${expired.length} stale offer(s)`);
      }
      return expired.length;
    }, { actor: 'system' });
  }

  /**
   * Transitions active subscriptions past their expires_at into 'expired'.
   * Publishes 'subscription.expired' to outbox within the same transaction.
   */
  async expireSubscriptions(): Promise<number> {
    return this.dbService.transaction(async (tx) => {
      const now = new Date();
      const expired = await tx
        .update(subscriptions)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(subscriptions.status, 'active'),
            lt(subscriptions.endsAt, now),
          ),
        )
        .returning({
          id: subscriptions.id,
          driverId: subscriptions.driverId,
        });

      for (const sub of expired) {
        await this.eventBus.publish(tx, 'subscription.expired', sub.id, {
          subscriptionId: sub.id,
          driverId: sub.driverId,
          expiredAt: now.toISOString(),
        });
      }

      if (expired.length > 0) {
        this.logger.log(`⏰ Expired ${expired.length} elapsed subscription(s)`);
      }
      return expired.length;
    }, { actor: 'system' });
  }

  /**
   * Run all periodic expiration sweeps in one invocation.
   */
  async runAllExpiryTasks(): Promise<{ orders: number; offers: number; subscriptions: number }> {
    const expiredOrders = await this.expireOrders();
    const expiredOffers = await this.expireOffers();
    const expiredSubs = await this.expireSubscriptions();
    return {
      orders: expiredOrders,
      offers: expiredOffers,
      subscriptions: expiredSubs,
    };
  }
}
