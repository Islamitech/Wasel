import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';

describe('المرحلة 8: تدقيق نهائي — الامتثال، التعديلات، والموقع', () => {
  let ctx: TestContext;
  let customerUser: { user: { id: string; phone: string }; token: string };
  let driverUser: { user: { id: string; phone: string }; token: string };

  beforeAll(async () => {
    ctx = await getTestContext();
    customerUser = await ctx.createCustomer({ fullName: 'عميل الامتثال' });
    driverUser = await ctx.createDriver({ fullName: 'كابتن الامتثال' });
  });

  describe('الامتثال وقانون حماية البيانات الشخصية 151/2020', () => {
    it('GET /v1/compliance/privacy-policy يعيد سياسة الخصوصية باللغة العربية مع إسناد قانون 151/2020', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/v1/compliance/privacy-policy');

      expect(res.status).toBe(200);

      expect(res.body).toHaveProperty('title');
      expect(res.body.title).toContain('سياسة الخصوصية');
      expect(res.body.jurisdiction).toContain('151 لسنة 2020');
      expect(Array.isArray(res.body.sections)).toBe(true);
      expect(res.body.sections.length).toBeGreaterThanOrEqual(4);
    });

    it('GET /v1/compliance/terms يعيد شروط الخدمة والوساطة التقنية والدفع النقدي المباشر', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/v1/compliance/terms')
        .expect(200);

      expect(res.body).toHaveProperty('title');
      expect(res.body.title).toContain('الشروط والأحكام');
      expect(Array.isArray(res.body.rules)).toBe(true);
      expect(res.body.summary).toContain('وساطة تقنية');
    });

    it('GET /v1/compliance/export يتطلب مصادقة ويعيد حزمة البيانات الشخصية للمستخدم', async () => {
      // 1. Without token => 401
      await request(ctx.app.getHttpServer())
        .get('/v1/compliance/export')
        .expect(401);

      // 2. With token => 200 with export package
      const res = await request(ctx.app.getHttpServer())
        .get('/v1/compliance/export')
        .set('Authorization', `Bearer ${customerUser.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('exportMetadata');
      expect(res.body.exportMetadata.userId).toBe(customerUser.user.id);
      expect(res.body.profile.id).toBe(customerUser.user.id);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(Array.isArray(res.body.agreements)).toBe(true);
    });

    it('DELETE /v1/compliance/account يمحو الحساب الشخصي ويعيد تأكيد الحذف', async () => {
      // Create a temporary user to delete
      const tempUser = await ctx.createCustomer({ fullName: 'مستخدم للحذف' });

      const res = await request(ctx.app.getHttpServer())
        .delete('/v1/compliance/account')
        .set('Authorization', `Bearer ${tempUser.token}`)
        .send({ reason: 'لم أعد بحاجة للخدمة' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('تم إغلاق الحساب ومحو البيانات الشخصية');
    });
  });

  describe('تحديث الموقع وتكرار الكباتن (Location Throttling & Deduplication)', () => {
    it('POST /v1/driver/location يقبل تحديث الموقع الجغرافي بنجاح', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/v1/driver/location')
        .set('Authorization', `Bearer ${driverUser.token}`)
        .send({
          points: [
            {
              latitude: 29.975,
              longitude: 31.115,
              recordedAt: new Date().toISOString(),
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /v1/driver/location يتعامل بمرونة مع تكرار النقاط المتطابقة دون انهيار', async () => {
      const now = new Date().toISOString();
      const res = await request(ctx.app.getHttpServer())
        .post('/v1/driver/location')
        .set('Authorization', `Bearer ${driverUser.token}`)
        .send({
          points: [
            { latitude: 29.975, longitude: 31.115, recordedAt: now },
            { latitude: 29.975, longitude: 31.115, recordedAt: now },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('تعديلات الاتفاقية المتبادلة وسلامة التنفيذ (Mutual Amendments & Agreement Integrity)', () => {
    let orderId: string;
    let agreementId: string;
    let stopId: string;

    beforeAll(async () => {
      // Create and publish an order
      const orderRes = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customerUser.token}`)
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
              description: 'محطة أصلية',
              expectedDurationMinutes: 10,
            },
          ],
        });

      orderId = orderRes.body.id;
      stopId = orderRes.body.stops[0].id;

      await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/publish`)
        .set('Authorization', `Bearer ${customerUser.token}`);

      const acceptRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${driverUser.token}`);

      agreementId = acceptRes.body.agreementId || acceptRes.body.id;
    });

    it('POST /v1/agreements/:id/amendments يقترح تعديلاً ويوافق عليه الطرف الآخر', async () => {
      // 1. Customer proposes amendment
      const amendRes = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/amendments`)
        .set('Authorization', `Bearer ${customerUser.token}`)
        .send({
          deltaFareMinor: 500, // +5 EGP
          reason: 'إضافة محطة إضافية لشراء خبز',
          addedStops: [
            {
              actionId: ctx.defaultActionId,
              location: { latitude: 29.985, longitude: 31.125 },
              description: 'محطة المخبز المضافة',
              expectedDurationMinutes: 10,
              invoiceRequired: false,
            },
          ],
        });

      expect(amendRes.status).toBe(201);
      const amendmentId = amendRes.body.id;
      expect(amendmentId).toBeDefined();

      // 2. Driver approves amendment
      const approveRes = await request(ctx.app.getHttpServer())
        .post(`/v1/amendments/${amendmentId}/approve`)
        .set('Authorization', `Bearer ${driverUser.token}`)
        .expect(200);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('approved');
    });

    it('يمنع إصدار فاتورة أو إكمال محطة بعد إتمام الاتفاقية (حالة غير active)', async () => {
      // Complete agreement
      await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/complete`)
        .set('Authorization', `Bearer ${driverUser.token}`)
        .expect(200);

      // Now attempting to complete stop should return 403 Forbidden
      const failStop = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/stops/${stopId}/complete`)
        .set('Authorization', `Bearer ${driverUser.token}`);

      expect(failStop.status).toBe(403);
      expect(failStop.body.message).toContain('غير نشط');

      // Attempting to issue invoice should also return 403 Forbidden
      const failInvoice = await request(ctx.app.getHttpServer())
        .post(`/v1/stops/${stopId}/invoice`)
        .set('Authorization', `Bearer ${driverUser.token}`)
        .send({
          invoiceNumber: 'INV-LATE-1',
          amountMinor: 5000,
          photoKey: 'orders/invoices/inv-late.jpg',
        });

      expect(failInvoice.status).toBe(403);
      expect(failInvoice.body.message).toContain('نشط');
    });
  });
});
