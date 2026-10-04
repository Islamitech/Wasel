import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import { agreements } from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Journey 4: Concurrency Race (Simultaneous Order Acceptance)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let driver1Token: string;
  let driver2Token: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    const customer = await ctx.createCustomer({ fullName: 'عميل السباق' });
    const driver1 = await ctx.createDriver({ fullName: 'كابتن السباق 1' });
    const driver2 = await ctx.createDriver({ fullName: 'كابتن السباق 2' });

    customerToken = customer.token;
    driver1Token = driver1.token;
    driver2Token = driver2.token;
  });

  it('guarantees exactly 1 winner and 1 409 conflict when two captains accept simultaneously', async () => {
    // 1. Customer drafts and publishes order
    const createRes = await request(ctx.app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
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
            description: 'طلب سريع للتوصيل',
            expectedDurationMinutes: 10,
            invoiceRequired: false,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customerToken}`);

    // 2. Both drivers accept the order at the exact same moment (Promise.all)
    const [res1, res2] = await Promise.all([
      request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({}),
      request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({}),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one must succeed (201) and the other must be rejected with 409 Conflict
    expect(statuses).toEqual([201, 409]);

    const failedRes = res1.status === 409 ? res1 : res2;
    expect(failedRes.body.errorCode).toMatch(/ORDER_ALREADY_AGREED|CONFLICT/);

    // 3. Verify exactly 1 active agreement exists in the database
    const activeAgreements = await ctx.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, orderId));

    expect(activeAgreements.length).toBe(1);
    expect(activeAgreements[0]?.status).toBe('active');
  });
});
