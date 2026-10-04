import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import { stopVisits } from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Journey 2: Shoe Repair (Waiting 2h + 100 EGP invoice = 100 EGP fare)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let driverToken: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    const customer = await ctx.createCustomer({ fullName: 'عميل تصليح الحذاء' });
    const driver = await ctx.createDriver({ fullName: 'كابتن تصليح الحذاء' });

    customerToken = customer.token;
    driverToken = driver.token;
  });

  it('calculates exactly 100 EGP final fare for 2 visits, 2h waiting, and 100 EGP invoice', async () => {
    // 1. Customer drafts order:
    // - Customer home location: 29.975, 31.115
    // - Stop 1: Customer Home (Explicit Pick Up: "استلام الحذاء من الشقة") -> counts as 1 customer visit
    // - Stop 2: Cobbler/Tailor shop (29.982, 31.125) with expected wait 2 hours
    // - Wait mode: 'wait'
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        regionId: ctx.regionId,
        valueTierId: ctx.defaultValueTierId,
        loadSizeId: ctx.defaultLoadSizeId,
        waitMode: 'wait',
        customerLocation: {
          latitude: 29.975,
          longitude: 31.115,
        },
        stops: [
          {
            actionId: ctx.defaultActionId,
            location: {
              latitude: 29.975, // Same as customer home -> explicit customer visit
              longitude: 31.115,
            },
            description: 'استلام الحذاء المراد تصليحه من باب الشقة',
            expectedDurationMinutes: 5,
            invoiceRequired: false,
          },
          {
            actionId: ctx.defaultActionId,
            location: {
              latitude: 29.982,
              longitude: 31.125,
            },
            description: 'ورشة تصليح وتلميع الأحذية - انتظار ساعتين حتى انتهاء العمل',
            expectedDurationMinutes: 120, // 2 hours
            invoiceRequired: true,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;
    const homeStopId = createRes.body.stops[0].id;
    const cobblerStopId = createRes.body.stops[1].id;

    // 2. Publish order
    const pubRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(pubRes.status).toBe(200);

    // 3. Driver accepts order
    const acceptRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(acceptRes.status).toBe(201);
    const agreementId = acceptRes.body.agreementId || acceptRes.body.id;

    // 4. Driver arrives at customer home for pickup & completes stop 1
    await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${homeStopId}/arrive`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ location: { latitude: 29.975, longitude: 31.115 } });

    await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${homeStopId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    // 5. Driver arrives at cobbler shop (external stop)
    const cobblerArrivalRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${cobblerStopId}/arrive`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ location: { latitude: 29.982, longitude: 31.125 } });

    expect(cobblerArrivalRes.status).toBe(201);
    const cobblerVisitId = cobblerArrivalRes.body.stopVisitId;

    // 6. Driver starts waiting
    const startWaitRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${cobblerStopId}/wait/start`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(startWaitRes.status).toBe(200);

    // Simulate 2 hours of waiting by setting arrivedAt 2 hours earlier on stop_visit
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await ctx.dbService.db
      .update(stopVisits)
      .set({ arrivedAt: twoHoursAgo, departedAt: new Date() })
      .where(eq(stopVisits.id, cobblerVisitId));

    // 7. Driver issues 100 EGP service invoice (10,000 minor)
    const invoiceRes = await request(ctx.app.getHttpServer())
      .post(`/v1/stops/${cobblerStopId}/invoice`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        invoiceNumber: 'INV-SHOE-100',
        amountMinor: 10000, // 100 EGP
        photoKey: 'orders/invoices/shoe-repair.jpg',
        customerNote: 'تكلفة تصليح وتغيير نعل الحذاء',
      });

    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.id;

    // 8. Customer records payment
    await request(ctx.app.getHttpServer())
      .post(`/v1/invoices/${invoiceId}/payment-recorded`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        collectedAmountMinor: 10000,
        receiptType: 'cash',
      });

    // 9. Complete cobbler stop
    await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${cobblerStopId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    // 10. Complete agreement -> SQL calculates final fare
    const completeRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(completeRes.status).toBe(200);

    // Formula Verification:
    // Visits: 2 (home pickup + cobbler) = 2 × 10 EGP = 20 EGP (2000 minor)
    // Waiting: 2 hours × 35 EGP = 70 EGP (7000 minor)
    // Goods/Service: 10% of 100 EGP = 10 EGP (1000 minor)
    // Final Fare = 20 + 70 + 10 = 100 EGP (10000 minor)
    expect(completeRes.body.calculatedFareMinor).toBe(10000);
  });
});
