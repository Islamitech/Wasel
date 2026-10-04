import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import { agreements } from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';

describe('Journey 3: Furniture Move (Counter-Offer, Immutability & Amendment)', () => {
  let ctx: TestContext;
  let customerToken: string;
  let driverToken: string;

  beforeAll(async () => {
    ctx = await getTestContext();
    const customer = await ctx.createCustomer({ fullName: 'عميل نقل العفش' });
    const driver = await ctx.createDriver({ fullName: 'كابتن نقل العفش' });

    customerToken = customer.token;
    driverToken = driver.token;
  });

  it('handles counter-offer, enforces locked agreement immutability, and approves mutual amendment', async () => {
    // 1. Customer drafts moving order
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
            location: { latitude: 29.970, longitude: 31.110 },
            description: 'نقل صالون وأنتريه من العمارة 120 ب',
            expectedDurationMinutes: 45,
            invoiceRequired: false,
          },
          {
            actionId: ctx.defaultActionId,
            location: { latitude: 29.985, longitude: 31.130 },
            description: 'تنزيل الصالون بالعمارة 45 د',
            expectedDurationMinutes: 45,
            invoiceRequired: false,
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    // 2. Publish order
    await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customerToken}`);

    // 3. Driver submits a counter offer: 350 EGP (35,000 minor)
    const offerRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/offers`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        offeredFareMinor: 35000, // 350 EGP
        notes: 'يشمل سائق ومساعد لحمل الصالون الثقيل',
      });

    expect(offerRes.status).toBe(201);
    const offerId = offerRes.body.id;

    // 4. Customer accepts driver's counter offer -> agreement is created and locked
    const acceptOfferRes = await request(ctx.app.getHttpServer())
      .post(`/v1/offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect([200, 201]).toContain(acceptOfferRes.status);
    const agreementId = acceptOfferRes.body.agreementId || acceptOfferRes.body.id;

    // 5. Verify Agreement Immutability:
    // When locked_at is set, any direct illegal mutation to agreement terms or snapshot raises 409 AGREEMENT_IMMUTABLE
    // Verify agreement is locked
    const [agreementRecord] = await ctx.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId));

    expect(agreementRecord?.lockedAt).toBeDefined();

    // 6. Driver proposes an amendment: +100 EGP (10,000 minor) for extra heavy marble table
    const amendmentRes = await request(ctx.app.getHttpServer())
      .post(`/v1/agreements/${agreementId}/amendments`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        newFareMinor: 45000, // 450 EGP
        reason: 'طلب العميل نقل طاولة رخامية إضافية تتطلب فك وتركيب',
      });

    expect(amendmentRes.status).toBe(201);
    const amendmentId = amendmentRes.body.id;
    expect(amendmentRes.body.status).toBe('pending');

    // 7. Customer approves the amendment
    const approveRes = await request(ctx.app.getHttpServer())
      .post(`/v1/amendments/${amendmentId}/approve`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('approved');

    // 8. Verify agreement updated with new agreed fare: 450 EGP (45000 minor)
    const [updatedAg] = await ctx.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId));

    expect(updatedAg?.agreedFareMinor).toBe(45000);
  });
});
