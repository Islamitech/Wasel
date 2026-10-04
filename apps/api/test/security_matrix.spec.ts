import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import { ErrorCode } from '@wasel/shared';

describe('Journey 5: Security, Permissions & Verification Matrix', () => {
  let ctx: TestContext;
  let customer1Token: string;
  let customer2Token: string;
  let driverSubscribedToken: string;
  let driverUnsubscribedToken: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    const customer1 = await ctx.createCustomer({ fullName: 'العميل الأول' });
    const customer2 = await ctx.createCustomer({ fullName: 'العميل الثاني' });
    const driverSub = await ctx.createDriver({ fullName: 'كابتن مشترك', hasSubscription: true });
    const driverUnsub = await ctx.createDriver({ fullName: 'كابتن بدون اشتراك', hasSubscription: false });

    customer1Token = customer1.token;
    customer2Token = customer2.token;
    driverSubscribedToken = driverSub.token;
    driverUnsubscribedToken = driverUnsub.token;
  });

  it('enforces customer order ownership and isolation (Customer 2 cannot view Customer 1 order)', async () => {
    // Customer 1 creates an order
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
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
            description: 'طلب خاص بالعميل 1',
            expectedDurationMinutes: 10,
            invoiceRequired: false,
          },
        ],
      });

    const orderId = createRes.body.id;

    // Customer 2 attempts to fetch Customer 1's order
    const getRes = await request(ctx.app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customer2Token}`);

    expect(getRes.status).toBe(403);
  });

  it('enforces SUBSCRIPTION_REQUIRED on driver searching nearby orders without subscription', async () => {
    const nearbyRes = await request(ctx.app.getHttpServer())
      .get('/v1/driver/orders/nearby')
      .set('Authorization', `Bearer ${driverUnsubscribedToken}`);

    expect(nearbyRes.status).toBe(403);
    expect(nearbyRes.body.errorCode).toBe(ErrorCode.SUBSCRIPTION_REQUIRED);
  });

  it('masks customer phone number until active agreement is formed', async () => {
    // Customer 1 creates and publishes an order
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
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
            description: 'طلب فحص حجب رقم الهاتف',
            expectedDurationMinutes: 10,
            invoiceRequired: false,
          },
        ],
      });

    const orderId = createRes.body.id;
    await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customer1Token}`);

    // Driver views published order details before agreement
    const detailsBefore = await request(ctx.app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${driverSubscribedToken}`);

    expect(detailsBefore.status).toBe(200);
    expect(detailsBefore.body.customerPhone).toBeUndefined();
    expect(detailsBefore.body.customerPhoneMasked).toBeDefined();
    expect(detailsBefore.body.customerPhoneMasked).toContain('****');

    // Driver accepts order -> agreement is formed
    await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${driverSubscribedToken}`);

    // Driver views order details after agreement
    const detailsAfter = await request(ctx.app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${driverSubscribedToken}`);

    expect(detailsAfter.status).toBe(200);
    expect(detailsAfter.body.customerPhone).toBeDefined();
    expect(detailsAfter.body.customerPhone).not.toContain('****');
  });

  it('enforces ILLEGAL_TRANSITION trigger error mapping to HTTP 409', async () => {
    // Create draft order
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customer1Token}`)
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
            description: 'فحص انتقال غير قانوني للحالة',
            expectedDurationMinutes: 10,
            invoiceRequired: false,
          },
        ],
      });

    const orderId = createRes.body.id;

    // Direct illegal transition: Attempting to accept a draft order without publishing
    const illegalAcceptRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${driverSubscribedToken}`);

    expect(illegalAcceptRes.status).toBe(409);
    expect(illegalAcceptRes.body.errorCode).toBe(ErrorCode.ILLEGAL_TRANSITION);
  });
});
