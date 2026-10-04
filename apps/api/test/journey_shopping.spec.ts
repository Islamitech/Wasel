import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';

describe('Journey 1: Shopping Order End-to-End', () => {
  let ctx: TestContext;
  let customerToken: string;
  let driverToken: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    const customer = await ctx.createCustomer({ fullName: 'عميل البقالة' });
    const driver = await ctx.createDriver({ fullName: 'كابتن البقالة' });

    customerToken = customer.token;
    driverToken = driver.token;
  });

  it('executes full shopping order lifecycle from draft to 26 EGP final fare', async () => {
    // 1. Customer drafts shopping order (1 store stop, customer location is Hadayek al-Ahram)
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        regionId: ctx.regionId,
        valueTierId: ctx.defaultValueTierId,
        loadSizeId: ctx.defaultLoadSizeId,
        waitMode: 'notify',
        customerLocation: {
          latitude: 29.975,
          longitude: 31.115,
        },
        stops: [
          {
            actionId: ctx.defaultActionId,
            location: {
              latitude: 29.980,
              longitude: 31.120,
            },
            description: 'شراء أغراض بقالة من سوبرماركت الفرجاني',
            expectedDurationMinutes: 15,
            invoiceRequired: true,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;
    const stopId = createRes.body.stops[0].id;
    expect(orderId).toBeDefined();
    expect(stopId).toBeDefined();

    // 2. Customer requests dynamic SQL quote
    const quoteRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/quote`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.billableVisits).toBe(1);
    expect(quoteRes.body.minFareMinor).toBeGreaterThan(0);

    // 3. Customer publishes order (freezes pricing snapshot)
    const pubRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(pubRes.status).toBe(200);
    expect(pubRes.body.status).toBe('published');

    // 4. Captain accepts shopping order at min fare -> creates agreement
    const acceptRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(acceptRes.status).toBe(201);
    const agreementId = acceptRes.body.agreementId || acceptRes.body.id;
    expect(agreementId).toBeDefined();

    // 5. Captain arrives at store stop
    const arriveRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${stopId}/arrive`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        location: { latitude: 29.980, longitude: 31.120 },
      });

    expect(arriveRes.status).toBe(201);
    expect(arriveRes.body.stopId).toBe(stopId);

    // 6. Captain issues invoice: 160 EGP (16,000 minor)
    const invoiceRes = await request(ctx.app.getHttpServer())
      .post(`/v1/stops/${stopId}/invoice`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        invoiceNumber: 'INV-SHOP-160',
        amountMinor: 16000, // 160 EGP
        photoKey: 'orders/invoices/inv-160.jpg',
        customerNote: 'فاتورة البقالة من السوبرماركت',
      });

    expect(invoiceRes.status).toBe(201);
    const invoiceId = invoiceRes.body.id;

    // 7. Customer records cash payment receipt for invoice
    const payRes = await request(ctx.app.getHttpServer())
      .post(`/v1/invoices/${invoiceId}/payment-recorded`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        collectedAmountMinor: 16000,
        receiptType: 'cash',
        notes: 'تم الدفع نقداً للمحل',
      });

    expect([200, 201]).toContain(payRes.status);

    // 8. Captain completes stop
    const completeStopRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/stops/${stopId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(completeStopRes.status).toBe(200);

    // 9. Captain completes agreement -> triggers SQL calculate_final_fare
    const completeAgRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(completeAgRes.status).toBe(200);

    // 10. Check final fare calculation matches the formula:
    // 1 visit (10 EGP = 1000 minor) + 0 wait + 10% of 160 EGP (16 EGP = 1600 minor) = 26 EGP (2600 minor)
    expect(completeAgRes.body.calculatedFareMinor).toBe(2600);
  });
});
