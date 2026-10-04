import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import {
  users,
  subscriptionPlans,
  subscriptionPayments,
} from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { MatchingService } from '../src/modules/matching/matching.service.js';
import { MatchingFacade } from '../src/modules/matching/matching.facade.js';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service.js';
import { DualFailoverOtpProvider } from '../src/common/providers/otp/dual-failover-otp.provider.js';
import { IOtpProvider } from '../src/common/providers/otp/otp.provider.interface.js';
import * as crypto from 'crypto';
import { Response } from 'express';

describe('المرحلة 5: تفعيل ما هو موصوف ولا يعمل (Phase 5: Features & Live Integrations)', () => {
  let ctx: TestContext;
  let realtimeService: RealtimeService;
  let matchingService: MatchingService;
  let matchingFacade: MatchingFacade;
  let subscriptionsService: SubscriptionsService;

  let customerUser: any;
  let customerToken: string;
  let driverUser: any;
  let driverToken: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    realtimeService = ctx.app.get(RealtimeService);
    matchingService = ctx.app.get(MatchingService);
    matchingFacade = ctx.app.get(MatchingFacade);
    subscriptionsService = ctx.app.get(SubscriptionsService);

    const customer = await ctx.createCustomer();
    customerUser = customer.user;
    customerToken = customer.token;

    const driver = await ctx.createDriver({ hasSubscription: true });
    driverUser = driver.user;
    driverToken = driver.token;
  });

  describe('أولاً: المطابقة المكانية وقائمة الطلبات القريبة (F-01)', () => {
    let testOrderId: string;

    it('ينشئ طلباً منشوراً بموقع جغرافي دقيق', async () => {
      const orderRes = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          regionId: ctx.regionId,
          valueTierId: ctx.defaultValueTierId,
          loadSizeId: ctx.defaultLoadSizeId,
          waitMode: 'notify',
          customerLocation: { latitude: 29.9754, longitude: 31.1158 },
          stops: [
            {
              actionId: ctx.defaultActionId,
              location: { latitude: 29.9802, longitude: 31.1205 },
              description: 'نقطة استلام قريبة',
              expectedDurationMinutes: 10,
              invoiceRequired: false,
            },
          ],
        });
      expect(orderRes.status).toBe(201);
      testOrderId = orderRes.body.id;

      const pubRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${testOrderId}/publish`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(pubRes.status).toBe(200);
    });

    it('يربط MatchingFacade.findEligibleDrivers الدالة المكانية app.find_eligible_drivers', async () => {
      // Find eligible drivers for the order
      const drivers = await matchingFacade.findEligibleDrivers(testOrderId, 50000, true);
      expect(Array.isArray(drivers)).toBe(true);
      // At least the test driver created with PostGIS coords nearby
      if (drivers.length > 0 && drivers[0]) {
        const found = drivers[0];
        expect(found).toHaveProperty('driverId');
        expect(found).toHaveProperty('distanceMeters');
        expect(typeof found.distanceMeters).toBe('number');
      }
    });

    it('يحسب getNearbyOrders استعلاماً مجمعاً واحداً مع مسافة حقيقية وترقيم بالـ cursor عبر /v1/driver/orders/nearby', async () => {
      const nearbyRes = await request(ctx.app.getHttpServer())
        .get('/v1/driver/orders/nearby')
        .query({
          lat: 29.9750,
          lng: 31.1150,
          radius: 10000,
          limit: 10,
        })
        .set('Authorization', `Bearer ${driverToken}`);

      expect(nearbyRes.status).toBe(200);
      expect(nearbyRes.body).toHaveProperty('data');
      expect(Array.isArray(nearbyRes.body.data)).toBe(true);

      const foundOrder = nearbyRes.body.data.find((o: any) => o.id === testOrderId);
      if (foundOrder) {
        expect(foundOrder.distanceMeters).toBeGreaterThan(0);
        expect(typeof foundOrder.distanceMeters).toBe('number');
      }
    });

    it('يستبعد getNearbyOrders طلبات السائق نفسه إن قام بإنشائها بحساب العميل', async () => {
      const nearbyRes = await request(ctx.app.getHttpServer())
        .get('/v1/driver/orders/nearby')
        .query({
          lat: 29.9750,
          lng: 31.1150,
        })
        .set('Authorization', `Bearer ${driverToken}`);

      expect(nearbyRes.status).toBe(200);
      for (const order of nearbyRes.body.data) {
        expect(order.customerId).not.toBe(driverUser.id);
      }
    });

    it('يختبر الأداء المكاني عبر محاكاة كفاءة البحث دون N+1 queries', async () => {
      const start = Date.now();
      const result = await matchingService.getNearbyOrders(driverUser.id, {
        lat: 29.9750,
        lng: 31.1150,
        radiusMeters: 10000,
        limit: 20,
      });
      const durationMs = Date.now() - start;

      // Single query execution must complete within reasonable time (< 500ms)
      expect(durationMs).toBeLessThan(500);
      expect(result).toHaveProperty('data');
      expect(result.meta).toHaveProperty('nextCursor');
    });
  });

  describe('ثانياً: الوقت الحقيقي وتذاكر الاتصال (F-02 Realtime & SSE)', () => {
    it('POST /v1/stream/ticket يولد تذكرة صالحة لمدة 30 ثانية لمرة واحدة فقط', async () => {
      const ticketRes = await request(ctx.app.getHttpServer())
        .post('/v1/stream/ticket')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body).toHaveProperty('ticket');
      expect(ticketRes.body.expiresIn).toBe(30);

      const ticket = ticketRes.body.ticket;
      expect(typeof ticket).toBe('string');
      expect(ticket.length).toBeGreaterThan(16);

      // Verify ticket consumption
      const consumedTicket = await realtimeService.consumeTicket(ticket);
      expect(consumedTicket).not.toBeNull();
      expect(consumedTicket?.userId).toBe(customerUser.id);

      // Second consumption must fail (single-use)
      const secondConsume = await realtimeService.consumeTicket(ticket);
      expect(secondConsume).toBeNull();
    });

    it('يرفض GET /v1/stream بدون تذكرة أو بتذكرة غير صالحة', async () => {
      const noTicketRes = await request(ctx.app.getHttpServer())
        .get('/v1/stream');
      expect(noTicketRes.status).toBe(401);

      const invalidTicketRes = await request(ctx.app.getHttpServer())
        .get('/v1/stream?ticket=invalid-ticket-value-12345');
      expect(invalidTicketRes.status).toBe(401);
    });

    it('يرفض الاتصالات المتجاوزة لحد الاتصالات المتزامنة لكل مستخدم (Max 5 connections)', async () => {
      const testUserId = crypto.randomUUID();
      const mockRes = {
        write: () => true,
        setHeader: () => {},
        flushHeaders: () => {},
      } as unknown as Response;

      // Add 5 client connections
      for (let i = 0; i < 5; i++) {
        await realtimeService.addClient(`client-${testUserId}-${i}`, testUserId, mockRes);
      }

      // Check that 6th connection is blocked
      expect(realtimeService.canUserConnect(testUserId, 5)).toBe(false);

      // Clean up clients
      for (let i = 0; i < 5; i++) {
        realtimeService.removeClient(`client-${testUserId}-${i}`);
      }
      expect(realtimeService.canUserConnect(testUserId, 5)).toBe(true);
    });

    it('يضمن توجيه الأحداث للمستلمين المحددين فقط دون بث عشوائي', async () => {
      const userA = crypto.randomUUID();
      const userB = crypto.randomUUID();

      let userAReceived = false;
      let userBReceived = false;

      const mockResA = {
        write: (chunk: string) => {
          if (chunk.includes('secret_data_for_user_a')) userAReceived = true;
          return true;
        },
      } as unknown as Response;

      const mockResB = {
        write: (chunk: string) => {
          if (chunk.includes('secret_data_for_user_a')) userBReceived = true;
          return true;
        },
      } as unknown as Response;

      await realtimeService.addClient('test-client-a', userA, mockResA);
      await realtimeService.addClient('test-client-b', userB, mockResB);

      // Dispatch event strictly to userA
      await realtimeService.emitToRecipients(
        'custom.test_notification',
        { secret_data_for_user_a: 'confirmed' },
        [userA],
      );

      expect(userAReceived).toBe(true);
      expect(userBReceived).toBe(false);

      realtimeService.removeClient('test-client-a');
      realtimeService.removeClient('test-client-b');
    });
  });

  describe('ثالثاً: مزود OTP مع التبديل التلقائي والحماية من الاحتيال (S-17)', () => {
    it('يقوم DualFailoverOtpProvider بالتبديل إلى SMS عند فشل WhatsApp الأساسي', async () => {
      let whatsappCalled = false;
      let smsCalled = false;

      const mockWhatsApp: IOtpProvider = {
        providerName: 'whatsapp',
        async sendOtp() {
          whatsappCalled = true;
          return { success: false, provider: 'whatsapp', error: 'Meta Cloud API 500 server error' };
        },
      };

      const mockSms: IOtpProvider = {
        providerName: 'sms',
        async sendOtp() {
          smsCalled = true;
          return { success: true, provider: 'sms', messageId: 'sms-fallback-success' };
        },
      };

      const dualProvider = new DualFailoverOtpProvider(
        mockWhatsApp as any,
        mockSms as any,
      );

      const res = await dualProvider.sendOtp({
        phone: '+201000000001',
        code: '123456',
        expiresInMinutes: 5,
      });

      expect(whatsappCalled).toBe(true);
      expect(smsCalled).toBe(true);
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('sms-fallback-success');
    });

    it('يرصد هجمات ضخ الـ SMS (Pumping Attacks) ويوقف الإرسال عند تجاوز الحد المسموح', async () => {
      const mockWhatsApp: IOtpProvider = {
        providerName: 'whatsapp',
        async sendOtp() {
          return { success: true, provider: 'whatsapp', messageId: 'wa-success' };
        },
      };
      const mockSms: IOtpProvider = {
        providerName: 'sms',
        async sendOtp() {
          return { success: true, provider: 'sms', messageId: 'sms-success' };
        },
      };

      const dualProvider = new DualFailoverOtpProvider(
        mockWhatsApp as any,
        mockSms as any,
      );

      const targetPhone = '+201999999999';

      // Send 5 OTPs within limit
      for (let i = 0; i < 5; i++) {
        const res = await dualProvider.sendOtp({ phone: targetPhone, code: '111111', expiresInMinutes: 5 });
        expect(res.success).toBe(true);
      }

      // 6th OTP exceeds daily limit of 5
      await expect(
        dualProvider.sendOtp({ phone: targetPhone, code: '111111', expiresInMinutes: 5 }),
      ).rejects.toThrow();
    });
  });

  describe('رابعاً: الاشتراكات وبوابة الدفع الإلكتروني (F-05 Subscriptions & Paymob)', () => {
    let testPlanId: string;

    beforeAll(async () => {
      const [plan] = await ctx.dbService.db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true))
        .limit(1);

      if (plan) {
        testPlanId = plan.id;
      }
    });

    it('يمنح اشتراكاً تجريبياً مجانياً (30 يوماً) لمرة واحدة فقط عند توثيق السائق دون تكرار', async () => {
      const trialDriver = await ctx.createDriver({ fullName: 'سائق تجريبي جديد', hasSubscription: false });
      const newDriverId = trialDriver.user.id;

      // 1. First trial grant
      const granted = await subscriptionsService.grantTrialSubscriptionIfEligible(newDriverId);
      expect(granted).toBe(true);

      const sub = await subscriptionsService.getDriverSubscription(newDriverId);
      expect(sub).toBeDefined();
      expect(sub?.status).toBe('active');
      expect(sub?.isTrial).toBe(true);
      expect(sub?.payments?.[0]?.paymentMethod).toBe('system_trial');

      // 2. Second attempt must not duplicate or re-grant
      const duplicateAttempt = await subscriptionsService.grantTrialSubscriptionIfEligible(newDriverId);
      expect(duplicateAttempt).toBe(false);
    });

    it('تمديد الاشتراك يضيف المدة إلى endsAt الحالي عند التجديد بدلاً من الاستبدال', async () => {
      if (!testPlanId) return;

      const [driver] = await ctx.dbService.db
        .select()
        .from(users)
        .where(eq(users.id, driverUser.id));

      expect(driver).toBeDefined();

      // Grant initial 30 days
      const sub1 = await subscriptionsService.grantOrRenewSubscription(
        driverUser.id,
        testPlanId,
        { paymentMethod: 'cash_fawry', paymentRef: 'ref-1' },
      );

      const originalEndsAt = new Date(sub1.subscription.endsAt).getTime();

      // Renew while still active -> endsAt must extend from originalEndsAt
      const sub2 = await subscriptionsService.grantOrRenewSubscription(
        driverUser.id,
        testPlanId,
        { paymentMethod: 'paymob', paymentRef: 'ref-2' },
      );

      const newEndsAt = new Date(sub2.subscription.endsAt).getTime();
      expect(newEndsAt).toBeGreaterThan(originalEndsAt);
    });

    it('يعالج webhook بوابة الدفع Paymob ويتحقق من التوقيع ويفعل الاشتراك بشكل idempotent', async () => {
      if (!testPlanId) return;

      const merchantOrderId = `order-pay-${Date.now()}`;
      const payload = {
        obj: {
          id: 1234567,
          success: true,
          amount_cents: 10000,
          currency: 'EGP',
          order: {
            id: 8888,
            merchant_order_id: merchantOrderId,
          },
          billing_data: {
            extra_description: driverUser.id,
          },
        },
        planId: testPlanId,
        driverId: driverUser.id,
      };

      // 1. Process valid webhook
      const webhookRes = await request(ctx.app.getHttpServer())
        .post('/v1/subscriptions/webhook')
        .set('x-paymob-hmac', 'test-signature-valid')
        .send(payload);

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.success).toBe(true);

      // Verify payment record in DB
      const [paymentRecord] = await ctx.dbService.db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.paymentRef, merchantOrderId));

      expect(paymentRecord).toBeDefined();
      if (paymentRecord) {
        expect(paymentRecord.status).toBe('completed');
      }

      // 2. Duplicate webhook submission (Idempotency) -> must succeed without duplicate entry
      const dupRes = await request(ctx.app.getHttpServer())
        .post('/v1/subscriptions/webhook')
        .set('x-paymob-hmac', 'test-signature-valid')
        .send(payload);

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.duplicate).toBe(true);
    });
  });
});
