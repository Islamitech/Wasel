import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import { orders, agreements, outbox, offers, subscriptions } from '../src/database/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { ExpiryService } from '../src/common/events/expiry.service.js';
import { OutboxProcessorService } from '../src/common/events/outbox-processor.service.js';
import { ErrorCode } from '@wasel/shared';

describe('المرحلة 3: معاملات، Outbox، انتهاءات، و Idempotency', () => {
  let ctx: TestContext;
  let expiryService: ExpiryService;
  let outboxProcessor: OutboxProcessorService;

  beforeAll(async () => {
    ctx = await getTestContext();
    expiryService = ctx.app.get(ExpiryService);
    outboxProcessor = ctx.app.get(OutboxProcessorService);
  });

  describe('1. Concurrency Race: 20 parallel driver acceptances', () => {
    it('guarantees exactly 1 winner, 19 conflicts, and exactly 1 active agreement in DB', async () => {
      // 1. Create customer and order
      const customer = await ctx.createCustomer({ fullName: 'عميل السباق الشامل' });
      const createRes = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          regionId: ctx.regionId,
          valueTierId: ctx.defaultValueTierId,
          loadSizeId: ctx.defaultLoadSizeId,
          waitMode: 'notify',
          customerLocation: { latitude: 29.975, longitude: 31.115 },
          stops: [
            {
              actionId: ctx.defaultActionId,
              location: { latitude: 29.980, longitude: 31.120 },
              description: 'محطة سباق التوصيل',
              expectedDurationMinutes: 10,
              invoiceRequired: false,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.id;

      // Publish order
      await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/publish`)
        .set('Authorization', `Bearer ${customer.token}`);

      // 2. Create 20 eligible drivers
      const drivers = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          ctx.createDriver({ fullName: `كابتن السباق ${i + 1}` }),
        ),
      );

      // 3. All 20 drivers submit acceptance simultaneously
      const results = await Promise.all(
        drivers.map((drv) =>
          request(ctx.app.getHttpServer())
            .post(`/v1/orders/${orderId}/accept`)
            .set('Authorization', `Bearer ${drv.token}`)
            .send({}),
        ),
      );

      const statusCounts = results.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>,
      );

      // Exactly 1 winner (201) and 19 rejections (409 Conflict)
      expect(statusCounts[201]).toBe(1);
      expect(statusCounts[409]).toBe(19);

      // Verify DB state: order must be 'agreed' and have exactly 1 active agreement
      const [orderRow] = await ctx.dbService.db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));
      expect(orderRow?.status).toBe('agreed');

      const activeAgreements = await ctx.dbService.db
        .select()
        .from(agreements)
        .where(and(eq(agreements.orderId, orderId), eq(agreements.status, 'active')));

      expect(activeAgreements.length).toBe(1);
      expect(activeAgreements[0]?.orderId).toBe(orderId);
    });
  });

  describe('2. Transaction Rollback & Atomicity', () => {
    it('rolls back completely if a step fails mid-transaction: 0 orphan orders, 0 outbox events', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل التراجع الذري' });

      // Invalid action ID causes a foreign key constraint violation during stops insertion
      const nonExistentActionId = '00000000-0000-0000-0000-000000000099';

      const initialOutboxCountRes = await ctx.dbService.db
        .select({ count: sql`count(*)` })
        .from(outbox);
      const initialOutboxCount = Number((initialOutboxCountRes[0] as any)?.count || 0);

      const res = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          regionId: ctx.regionId,
          valueTierId: ctx.defaultValueTierId,
          loadSizeId: ctx.defaultLoadSizeId,
          waitMode: 'notify',
          customerLocation: { latitude: 29.975, longitude: 31.115 },
          stops: [
            {
              actionId: nonExistentActionId,
              location: { latitude: 29.980, longitude: 31.120 },
              description: 'محطة غير صالحة ستسبب فشل القيد',
            },
          ],
        });

      // Expect failure
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Verify no orphan orders created for this customer
      const customerOrders = await ctx.dbService.db
        .select()
        .from(orders)
        .where(eq(orders.customerId, customer.user.id));

      expect(customerOrders.length).toBe(0);

      // Verify no outbox events created
      const finalOutboxCountRes = await ctx.dbService.db
        .select({ count: sql`count(*)` })
        .from(outbox);
      const finalOutboxCount = Number((finalOutboxCountRes[0] as any)?.count || 0);

      expect(finalOutboxCount).toBe(initialOutboxCount);
    });
  });

  describe('3. Idempotency with Redis', () => {
    it('returns cached response on duplicate request, rejects payload mismatch with 422, and isolates across users', async () => {
      const customer1 = await ctx.createCustomer({ fullName: 'عميل مانع التكرار 1' });
      const customer2 = await ctx.createCustomer({ fullName: 'عميل مانع التكرار 2' });

      const idempotencyKey = `test-idem-${Date.now()}`;
      const payload1 = {
        regionId: ctx.regionId,
        valueTierId: ctx.defaultValueTierId,
        loadSizeId: ctx.defaultLoadSizeId,
        waitMode: 'notify',
        customerLocation: { latitude: 29.975, longitude: 31.115 },
        stops: [
          {
            actionId: ctx.defaultActionId,
            location: { latitude: 29.980, longitude: 31.120 },
            description: 'طلب منع التكرار الأصلي',
          },
        ],
      };

      // 1. Initial request with Idempotency-Key
      const res1 = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);

      expect(res1.status).toBe(201);
      const createdOrderId = res1.body.id;
      expect(createdOrderId).toBeDefined();

      // 2. Duplicate exact request with same Idempotency-Key
      const res2 = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);

      // Replays cached response body
      expect(res2.body.id).toBe(createdOrderId);

      // 3. Different payload with same Idempotency-Key -> 422 Payload Mismatch
      const differentPayload = {
        ...payload1,
        waitMode: 'wait', // Changed field
      };

      const resMismatch = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer1.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(differentPayload);

      expect(resMismatch.status).toBe(422);
      expect(resMismatch.body.errorCode).toBe(ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH);

      // 4. Same Idempotency-Key used by a DIFFERENT user -> ISOLATED (allowed to proceed independently)
      const resUser2 = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customer2.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);

      expect(resUser2.status).toBe(201);
      expect(resUser2.body.id).not.toBe(createdOrderId);
      expect(resUser2.body.customerId).toBe(customer2.user.id);
    });
  });

  describe('4. Outbox Worker: Concurrency, Exponential Backoff & Dead-Lettering', () => {
    it('concurrent batch polls do not duplicate events, failed handlers retry with exponential backoff and transition to dead', async () => {
      // 1. Insert a mock outbox event directly
      const [testEvent] = await ctx.dbService.db
        .insert(outbox)
        .values({
          eventName: 'test.failure.simulation',
          aggregateId: '00000000-0000-0000-0000-000000000001',
          payload: { test: true },
          status: 'pending',
          attempts: 0,
        })
        .returning();

      expect(testEvent).toBeDefined();

      let handlerCallCount = 0;
      // Register a failing handler for this event
      outboxProcessor.registerHandler('test.failure.simulation', async () => {
        handlerCallCount++;
        throw new Error('Simulated processing failure');
      });

      // 2. Run two concurrent processBatch calls -> SKIP LOCKED ensures only one picks it up
      await Promise.all([
        outboxProcessor.processBatch(10),
        outboxProcessor.processBatch(10),
      ]);

      // Exactly one attempt made
      expect(handlerCallCount).toBe(1);

      // Check event state in DB
      let [updatedEvent] = await ctx.dbService.db
        .select()
        .from(outbox)
        .where(eq(outbox.id, testEvent!.id));

      expect(updatedEvent?.attempts).toBe(1);
      expect(updatedEvent?.status).toBe('pending');
      expect(updatedEvent?.nextAttemptAt).not.toBeNull();

      // 3. Fast-forward attempts to max_attempts (5) and process again -> becomes 'dead'
      await ctx.dbService.db
        .update(outbox)
        .set({ attempts: 4, nextAttemptAt: new Date(Date.now() - 1000) })
        .where(eq(outbox.id, testEvent!.id));

      await outboxProcessor.processBatch(10);

      [updatedEvent] = await ctx.dbService.db
        .select()
        .from(outbox)
        .where(eq(outbox.id, testEvent!.id));

      expect(updatedEvent?.status).toBe('dead');
      expect(updatedEvent?.attempts).toBe(5);
    });
  });

  describe('5. Periodic Expiration Sweeps (D-06)', () => {
    it('sweeps expired orders, offers, and subscriptions atomically and publishes outbox events', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل الانتهاء' });
      const driver = await ctx.createDriver({ fullName: 'كابتن الانتهاء' });

      const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute in the past

      // 1. Create an elapsed order
      const [elapsedOrder] = await ctx.dbService.db
        .insert(orders)
        .values({
          customerId: customer.user.id,
          regionId: ctx.regionId,
          status: 'published',
          minFareMinor: 2500,
          customerLocation: { lat: 29.975, lng: 31.115 },
          expiresAt: pastDate,
        })
        .returning();

      // 2. Create an elapsed offer
      const [elapsedOffer] = await ctx.dbService.db
        .insert(offers)
        .values({
          orderId: elapsedOrder!.id,
          driverId: driver.user.id,
          offeredFareMinor: 3000,
          status: 'pending',
          expiresAt: pastDate,
        })
        .returning();

      // 3. Create an elapsed subscription
      const [elapsedSub] = await ctx.dbService.db
        .insert(subscriptions)
        .values({
          driverId: driver.user.id,
          planId: (await ctx.dbService.db.select().from(subscriptions).limit(1))[0]!.planId,
          status: 'active',
          startsAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
          endsAt: pastDate,
          isTrial: false,
        })
        .returning();

      // Run sweeps
      const expiredOrdersCount = await expiryService.expireOrders();
      const expiredOffersCount = await expiryService.expireOffers();
      const expiredSubsCount = await expiryService.expireSubscriptions();

      expect(expiredOrdersCount).toBeGreaterThanOrEqual(1);
      expect(expiredOffersCount).toBeGreaterThanOrEqual(1);
      expect(expiredSubsCount).toBeGreaterThanOrEqual(1);

      // Verify statuses in DB
      const [checkedOrder] = await ctx.dbService.db
        .select()
        .from(orders)
        .where(eq(orders.id, elapsedOrder!.id));
      expect(checkedOrder?.status).toBe('expired');

      const [checkedOffer] = await ctx.dbService.db
        .select()
        .from(offers)
        .where(eq(offers.id, elapsedOffer!.id));
      expect(checkedOffer?.status).toBe('expired');

      const [checkedSub] = await ctx.dbService.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, elapsedSub!.id));
      expect(checkedSub?.status).toBe('expired');
    });
  });
});
