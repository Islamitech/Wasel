import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { DatabaseService, type DatabaseTransaction } from '../../database/database.service.js';
import {
  subscriptions,
  subscriptionPlans,
  subscriptionPayments,
  users,
} from '../../database/schema/index.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER_TOKEN,
} from '../../common/providers/payment/index.js';
import {
  AdminGrantSubscriptionDto,
  AdminRecordSubPaymentDto,
} from '@wasel/shared';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider?: IPaymentProvider,
  ) {}

  /**
   * Retrieves the driver's current subscription.
   * Priority: returns currently active valid subscription (status='active' AND startsAt<=now AND endsAt>=now).
   * Fallback: returns the most recent historical subscription.
   */
  async getDriverSubscription(driverId: string) {
    const now = new Date();

    // 1. Try currently active, valid subscription first
    let [sub] = await this.dbService.db
      .select({
        sub: subscriptions,
        plan: subscriptionPlans,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(
        and(
          eq(subscriptions.driverId, driverId),
          eq(subscriptions.status, 'active'),
          lte(subscriptions.startsAt, now),
          gte(subscriptions.endsAt, now),
        ),
      )
      .orderBy(desc(subscriptions.endsAt))
      .limit(1);

    // 2. Fallback to latest subscription if none currently active
    if (!sub) {
      [sub] = await this.dbService.db
        .select({
          sub: subscriptions,
          plan: subscriptionPlans,
        })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.driverId, driverId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
    }

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

    // Fetch payments history
    const payments = await this.dbService.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, sub.sub.id))
      .orderBy(desc(subscriptionPayments.createdAt));

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
      payments: payments.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
        paymentMethod: p.paymentMethod,
        paymentRef: p.paymentRef,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
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

  /**
   * Grants or renews subscription.
   * If driver already has an active subscription, renewals extend from existing endsAt!
   */
  async grantOrRenewSubscription(
    driverId: string,
    planId: string,
    options: {
      adminUserId?: string;
      paymentMethod?: string;
      paymentRef?: string;
      durationDays?: number;
      isTrial?: boolean;
    } = {},
    externalTx?: DatabaseTransaction,
  ) {
    const execute = async (tx: DatabaseTransaction) => {
      const [plan] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);

      if (!plan) {
        throw new NotFoundException('خطة الاشتراك غير موجودة');
      }

      const now = new Date();

      // Check if driver has an existing active subscription ending in the future
      const [activeSub] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.driverId, driverId),
            eq(subscriptions.status, 'active'),
            gte(subscriptions.endsAt, now),
          ),
        )
        .orderBy(desc(subscriptions.endsAt))
        .limit(1);

      // Renewal starts from active subscription's endsAt, or now
      let startsAt = now;
      if (activeSub && activeSub.endsAt > now) {
        startsAt = activeSub.endsAt;
      }

      const duration = options.durationDays || plan.durationDays;
      const endsAt = new Date(startsAt.getTime() + duration * 24 * 60 * 60 * 1000);

      const [created] = await tx
        .insert(subscriptions)
        .values({
          driverId,
          planId,
          startsAt,
          endsAt,
          status: 'active',
          isTrial: options.isTrial || false,
        })
        .returning();

      // Record payment linking to subscription
      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          subscriptionId: created!.id,
          amountMinor: options.isTrial ? 0 : plan.priceMinor,
          paymentMethod: options.paymentMethod || 'manual_admin',
          paymentRef: options.paymentRef || null,
          status: 'completed',
        })
        .returning();

      await this.auditService.log({
        userId: options.adminUserId || driverId,
        action: options.isTrial ? 'driver_trial_granted' : 'subscription_activated',
        entityType: 'subscriptions',
        entityId: created!.id,
        afterState: {
          driverId,
          planCode: plan.code,
          startsAt,
          endsAt,
          isTrial: options.isTrial,
          paymentId: payment!.id,
        },
      }, tx);

      return { subscription: created!, payment: payment! };
    };

    if (externalTx) {
      return execute(externalTx);
    }
    return this.dbService.transaction(execute, { actor: options.adminUserId ? 'admin' : 'system' });
  }

  async adminGrantSubscription(adminUserId: string, dto: AdminGrantSubscriptionDto) {
    const res = await this.grantOrRenewSubscription(dto.driverId, dto.planId, {
      adminUserId,
      durationDays: dto.durationDays,
      isTrial: dto.isTrial,
      paymentMethod: 'manual_admin',
    });
    return res.subscription;
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

    return await this.dbService.transaction(
      async (tx) => {
        const [payment] = await tx
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
      },
      { actor: 'admin' },
    );
  }

  /**
   * Automatic 30-day free trial on driver approval from settings without duplicate grants.
   */
  async grantTrialSubscriptionIfEligible(driverId: string, externalTx?: DatabaseTransaction): Promise<boolean> {
    // Resolve duration from settings before entering transaction to prevent deadlock
    const durationDays = await this.settingsService.get<number>(
      'trial_subscription_duration_days',
      undefined,
      30,
    );

    const execute = async (tx: DatabaseTransaction) => {
      // 1. Idempotency: verify driver has NEVER had a trial subscription
      const [existingTrial] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.driverId, driverId), eq(subscriptions.isTrial, true)))
        .limit(1);

      if (existingTrial) {
        this.logger.debug(`Driver ${driverId} already received a trial subscription. Skipping duplicate grant.`);
        return false;
      }

      // 2. Fetch trial plan
      const [trialPlan] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, 'trial_30d'))
        .limit(1);

      if (!trialPlan) {
        this.logger.warn('Trial subscription plan (trial_30d) not found in subscription_plans.');
        return false;
      }

      // 3. Grant trial
      await this.grantOrRenewSubscription(
        driverId,
        trialPlan.id,
        {
          durationDays: durationDays || trialPlan.durationDays || 30,
          isTrial: true,
          paymentMethod: 'system_trial',
          paymentRef: `trial-${driverId.substring(0, 8)}`,
        },
        tx,
      );

      this.logger.log(`✅ Granted ${durationDays}-day free trial subscription to driver ${driverId}`);
      return true;
    };

    if (externalTx) {
      return execute(externalTx);
    }
    return this.dbService.transaction(execute, { actor: 'system' });
  }

  /**
   * Initiates an electronic payment session via configured PaymentProvider (e.g. Paymob)
   */
  async initiateSubscriptionPayment(driverId: string, planId: string) {
    if (!this.paymentProvider) {
      throw new BadRequestException('بوابة الدفع الإلكتروني غير مفعلة حالياً');
    }

    const [plan] = await this.dbService.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan || !plan.isActive) {
      throw new NotFoundException('خطة الاشتراك غير متوفرة');
    }

    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, driverId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return this.paymentProvider.createPaymentSession({
      subscriptionId: '',
      driverId,
      planId,
      amountMinor: plan.priceMinor,
      phone: user.phone || '',
      fullName: user.fullName || undefined,
    });
  }

  /**
   * Idempotent webhook handler verifying provider signature and activating subscription
   */
  async handlePaymentWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    query?: unknown,
  ) {
    if (!this.paymentProvider) {
      throw new BadRequestException('Payment provider not configured');
    }

    const verification = await this.paymentProvider.verifyWebhook(headers, body, query);
    if (!verification.isValid) {
      this.logger.warn('Invalid signature on subscription payment webhook');
      throw new UnauthorizedException('توقيع إشعار الدفع غير صالح');
    }

    const paymentRef = verification.paymentRef;
    if (!paymentRef) {
      return { success: false, message: 'Missing paymentRef in webhook payload' };
    }

    // Idempotency: check if payment was already recorded
    const [existing] = await this.dbService.db
      .select({ id: subscriptionPayments.id })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.paymentRef, paymentRef))
      .limit(1);

    if (existing) {
      this.logger.debug(`Webhook paymentRef "${paymentRef}" already processed. Skipping duplicate execution.`);
      return { success: true, message: 'Already processed', duplicate: true };
    }

    if (!verification.isSuccessful) {
      this.logger.log(`Payment was not successful for ref "${paymentRef}".`);
      return { success: true, status: 'unsuccessful_noted' };
    }

    // Extract metadata from webhook (driverId and planId)
    const raw = verification.rawPayload;
    const rawObj = raw?.obj && typeof raw.obj === 'object' ? (raw.obj as Record<string, unknown>) : undefined;
    const billingData =
      rawObj?.billing_data && typeof rawObj.billing_data === 'object'
        ? (rawObj.billing_data as Record<string, unknown>)
        : undefined;

    const queryRecord = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;

    const driverId =
      (typeof billingData?.extra_description === 'string' ? billingData.extra_description : undefined) ||
      (typeof raw?.driverId === 'string' ? raw.driverId : undefined) ||
      (typeof queryRecord.driverId === 'string' ? queryRecord.driverId : undefined);

    const planId =
      (typeof raw?.planId === 'string' ? raw.planId : undefined) ||
      (typeof queryRecord.planId === 'string' ? queryRecord.planId : undefined);

    if (driverId && planId) {
      await this.grantOrRenewSubscription(driverId, planId, {
        paymentMethod: this.paymentProvider.providerName,
        paymentRef,
      });
      this.logger.log(`✅ Subscription activated via webhook for driver ${driverId} (ref: ${paymentRef})`);
    }

    return { success: true, message: 'Payment recorded and subscription activated' };
  }

  async isDriverSubscribed(driverId: string, tx?: DatabaseTransaction): Promise<boolean> {
    const now = new Date();
    const dbClient = tx || this.dbService.db;
    const [activeSub] = await dbClient
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

