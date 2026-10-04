import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  subscriptions,
  subscriptionPlans,
  subscriptionPayments,
} from '../../database/schema/index.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import {
  AdminGrantSubscriptionDto,
  AdminRecordSubPaymentDto,
} from '@wasel/shared';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getDriverSubscription(driverId: string) {
    const now = new Date();
    const [sub] = await this.dbService.db
      .select({
        sub: subscriptions,
        plan: subscriptionPlans,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.driverId, driverId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (!sub) {
      return {
        hasSubscription: false,
        isActiveNow: false,
        daysRemaining: 0,
      };
    }

    const isActiveNow =
      sub.sub.status === 'active' &&
      new Date(sub.sub.startsAt) <= now &&
      new Date(sub.sub.endsAt) >= now;

    const msDiff = new Date(sub.sub.endsAt).getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));

    return {
      hasSubscription: true,
      id: sub.sub.id,
      status: sub.sub.status,
      isTrial: sub.sub.isTrial,
      planCode: sub.plan.code,
      planNameAr: sub.plan.nameAr,
      startsAt: sub.sub.startsAt.toISOString(),
      endsAt: sub.sub.endsAt.toISOString(),
      isActiveNow,
      daysRemaining,
    };
  }

  async getSubscriptionPlans() {
    const plans = await this.dbService.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true));

    return plans.map((p) => ({
      id: p.id,
      code: p.code,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      priceMinor: p.priceMinor,
      formattedPriceEgp: `${(p.priceMinor / 100).toFixed(0)} ج.م`,
      durationDays: p.durationDays,
      isActive: p.isActive,
    }));
  }

  async adminGrantSubscription(adminUserId: string, dto: AdminGrantSubscriptionDto) {
    const [plan] = await this.dbService.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, dto.planId))
      .limit(1);

    if (!plan) {
      throw new NotFoundException('خطة الاشتراك غير موجودة');
    }

    const duration = dto.durationDays || plan.durationDays;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + duration * 24 * 60 * 60 * 1000);

    const [created] = await this.dbService.db
      .insert(subscriptions)
      .values({
        driverId: dto.driverId,
        planId: dto.planId,
        startsAt,
        endsAt,
        status: 'active',
        isTrial: dto.isTrial || false,
      })
      .returning();

    await this.auditService.log({
      userId: adminUserId,
      action: 'admin_subscription_granted',
      entityType: 'subscriptions',
      entityId: created!.id,
      afterState: { driverId: dto.driverId, planCode: plan.code, endsAt, isTrial: dto.isTrial },
    });

    return created;
  }

  async adminRecordPayment(subscriptionId: string, adminUserId: string, dto: AdminRecordSubPaymentDto) {
    const [sub] = await this.dbService.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!sub) {
      throw new NotFoundException('الاشتراك غير موجود');
    }

    const [payment] = await this.dbService.db
      .insert(subscriptionPayments)
      .values({
        subscriptionId,
        amountMinor: dto.amountMinor,
        paymentMethod: dto.paymentMethod || 'manual_admin',
        paymentRef: dto.paymentRef,
        status: 'completed',
      })
      .returning();

    await this.auditService.log({
      userId: adminUserId,
      action: 'subscription_payment_recorded',
      entityType: 'subscription_payments',
      entityId: payment!.id,
      afterState: { subscriptionId, amountMinor: dto.amountMinor, paymentMethod: dto.paymentMethod },
    });

    return payment;
  }

  async isDriverSubscribed(driverId: string): Promise<boolean> {
    const now = new Date();
    const [activeSub] = await this.dbService.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.driverId, driverId),
          eq(subscriptions.status, 'active'),
          lte(subscriptions.startsAt, now),
          gte(subscriptions.endsAt, now),
        ),
      )
      .limit(1);

    return !!activeSub;
  }
}
