import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestContext, TestContext } from './test-harness.js';
import {
  agreements,
  auditLogs,
  verificationDocuments,
} from '../src/database/schema/index.js';
import { eq, and } from 'drizzle-orm';

describe('المرحلة 4: الخصوصية والتفويض وحماية IDOR', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await getTestContext();
  });

  // Helper to create and publish a standard test order
  async function createPublishedOrder(customerToken: string, custom?: any) {
    const createRes = await request(ctx.app.getHttpServer())
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
            description: 'محطة استلام بضائع',
            expectedDurationMinutes: 10,
            invoiceRequired: false,
          },
        ],
        ...custom,
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    const pubRes = await request(ctx.app.getHttpServer())
      .post(`/v1/orders/${orderId}/publish`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(pubRes.status).toBe(200);
    return orderId;
  }

  describe('1. quoteOrder Fine-Grained Authorization', () => {
    it('allows order owner to quote their order', async () => {
      const customer = await ctx.createCustomer({ fullName: 'مالك الطلب للاقتباس' });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/quote`)
        .set('Authorization', `Bearer ${customer.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('minFareMinor');
      expect(res.body).toHaveProperty('breakdown');
    });

    it('rejects another customer from quoting the order (403 Forbidden)', async () => {
      const customerA = await ctx.createCustomer({ fullName: 'عميل أ للاقتباس' });
      const customerB = await ctx.createCustomer({ fullName: 'عميل ب متطفل' });
      const orderId = await createPublishedOrder(customerA.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/quote`)
        .set('Authorization', `Bearer ${customerB.token}`);

      expect(res.status).toBe(403);
    });

    it('allows an eligible subscribed driver in same region to quote the order', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل طلب الكابتن' });
      const driver = await ctx.createDriver({ fullName: 'كابتن مؤهل للاقتباس', hasSubscription: true });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/quote`)
        .set('Authorization', `Bearer ${driver.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('minFareMinor');
    });

    it('rejects an unsubscribed driver from quoting the order (403 Forbidden)', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل طلب كابتن غير مشترك' });
      const driver = await ctx.createDriver({ fullName: 'كابتن غير مشترك للاقتباس', hasSubscription: false });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/quote`)
        .set('Authorization', `Bearer ${driver.token}`);

      expect(res.status).toBe(403);
    });

    it('allows admin to quote any order', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل طلب المدير' });
      const admin = await ctx.createAdmin({ fullName: 'مدير النظام' });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/quote`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('minFareMinor');
    });
  });

  describe('2. getOrderDetails & OrderRadarView (S-12) & IDOR', () => {
    it('returns full view with exact coordinates and customer details to the order owner', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل التفاصيل الكاملة' });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customer.token}`);

      expect(res.status).toBe(200);
      expect(res.body.customerId).toBe(customer.user.id);
      expect(res.body.customerName).toBeDefined();
      expect(res.body.customerLocation.latitude).toBeCloseTo(29.9754, 3);
      expect(res.body.customerLocation.longitude).toBeCloseTo(31.1158, 3);
    });

    it('blocks another customer with 403 Forbidden (preventing IDOR)', async () => {
      const customerA = await ctx.createCustomer({ fullName: 'عميل أ الخاص' });
      const customerB = await ctx.createCustomer({ fullName: 'عميل ب المتسلل' });
      const orderId = await createPublishedOrder(customerA.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerB.token}`);

      expect(res.status).toBe(403);
    });

    it('returns OrderRadarView to eligible driver: no customerId, no customerName, obfuscated location', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل رادار السائق' });
      const driver = await ctx.createDriver({ fullName: 'كابتن رادار الطلبات', hasSubscription: true });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${driver.token}`);

      expect(res.status).toBe(200);
      // PII must be completely omitted
      expect(res.body.customerId).toBeUndefined();
      expect(res.body.customer).toBeUndefined();
      expect(res.body.customerName).toBeUndefined();
      expect(res.body.customerPhone).toBeUndefined();

      // Coordinates must be obfuscated (~300m grid snapped)
      expect(res.body.customerLocation).toBeDefined();
      expect(res.body.customerLocation.latitude).not.toBe(29.9754);
      expect(res.body.stops[0].location.latitude).not.toBe(29.9802);
      expect(res.body.stops[0].contactPhone).toBeUndefined();
    });

    it('rejects an unsubscribed driver from viewing open order radar (403 Forbidden)', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل رادار غير متاح' });
      const driver = await ctx.createDriver({ fullName: 'كابتن بدون اشتراك للرادار', hasSubscription: false });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${driver.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Order Media Upload (S-08) & Presigned URLs', () => {
    it('validates request body via Zod schema and rejects invalid mediaType', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل وسائط غير صالحة' });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/media/upload-url`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          mediaType: 'application/pdf', // Not allowed
          fileSizeBytes: 1024,
        });

      expect(res.status).toBe(400);
    });

    it('rejects non-owner from requesting upload URL (403 Forbidden)', async () => {
      const customerA = await ctx.createCustomer({ fullName: 'مالك طلب الوسائط' });
      const customerB = await ctx.createCustomer({ fullName: 'عميل ب المتطفل على الوسائط' });
      const orderId = await createPublishedOrder(customerA.token);

      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/media/upload-url`)
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({
          mediaType: 'image/jpeg',
          fileSizeBytes: 2048,
        });

      expect(res.status).toBe(403);
    });

    it('allows owner to request upload URL in private bucket with derived extension', async () => {
      const customer = await ctx.createCustomer({ fullName: 'مالك طلب وسائط ناجح' });
      const orderId = await createPublishedOrder(customer.token);

      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/media/upload-url`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          mediaType: 'image/png',
          fileSizeBytes: 5000,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uploadUrl');
      expect(res.body).toHaveProperty('storageKey');
      expect(res.body.storageKey).toMatch(/^orders\/[a-f0-9-]+\/[a-f0-9-]+\.png$/);
    });

    it('enforces media limit per order', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل يرفع وسائط كثيرة' });
      const orderId = await createPublishedOrder(customer.token);

      // Max default is 10
      for (let i = 0; i < 10; i++) {
        const res = await request(ctx.app.getHttpServer())
          .post(`/v1/orders/${orderId}/media/upload-url`)
          .set('Authorization', `Bearer ${customer.token}`)
          .send({
            mediaType: 'image/jpeg',
            fileSizeBytes: 1024,
          });
        expect(res.status).toBe(200);
      }

      // 11th upload request should fail with 400
      const excessRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/media/upload-url`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          mediaType: 'image/jpeg',
          fileSizeBytes: 1024,
        });

      expect(excessRes.status).toBe(400);
    });

    it('allows download url generation only for owner, admin, or agreement driver', async () => {
      const customerA = await ctx.createCustomer({ fullName: 'مالك طلب التنزيل' });
      const customerB = await ctx.createCustomer({ fullName: 'متسلل التنزيل' });
      const admin = await ctx.createAdmin({ fullName: 'مدير تنزيل الوسائط' });
      const orderId = await createPublishedOrder(customerA.token);

      // Upload one media
      const uploadRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/media/upload-url`)
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({
          mediaType: 'image/jpeg',
          fileSizeBytes: 1024,
        });

      const mediaId = uploadRes.body.mediaId;

      // Customer B -> 403 Forbidden
      const unauthorizedRes = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/media/${mediaId}/download-url`)
        .set('Authorization', `Bearer ${customerB.token}`);
      expect(unauthorizedRes.status).toBe(403);

      // Customer A -> 200 OK
      const ownerRes = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/media/${mediaId}/download-url`)
        .set('Authorization', `Bearer ${customerA.token}`);
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body).toHaveProperty('downloadUrl');

      // Admin -> 200 OK
      const adminRes = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/media/${mediaId}/download-url`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminRes.status).toBe(200);
    });
  });

  describe('4. Driver Verification Documents & Sensitive Metadata Encryption (S-09)', () => {
    it('validates document upload URL and derived file extension', async () => {
      const driver = await ctx.createDriver({ fullName: 'كابتن رفع وثائق' });

      const res = await request(ctx.app.getHttpServer())
        .post('/v1/driver/documents/upload-url')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({
          mediaType: 'image/jpeg',
        });

      expect(res.status).toBe(201);
      expect(res.body.storageKey).toMatch(new RegExp(`^drivers/${driver.user.id}/[a-f0-9-]+\\.jpg$`));
    });

    it('rejects document submission if storageKey does not match drivers/{userId}/ prefix', async () => {
      const driverA = await ctx.createDriver({ fullName: 'كابتن أ وثائق' });
      const driverB = await ctx.createDriver({ fullName: 'كابتن ب وثائق' });

      const res = await request(ctx.app.getHttpServer())
        .post('/v1/driver/documents')
        .set('Authorization', `Bearer ${driverB.token}`)
        .send({
          type: 'national_id_front',
          storageKey: `drivers/${driverA.user.id}/forged.jpg`, // Fraudulent key
        });

      expect(res.status).toBe(400);
    });

    it('rejects document submission if file is missing in storage (HEAD verification)', async () => {
      const driver = await ctx.createDriver({ fullName: 'كابتن وثيقة غير موجودة' });

      const res = await request(ctx.app.getHttpServer())
        .post('/v1/driver/documents')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({
          type: 'national_id_front',
          storageKey: `drivers/${driver.user.id}/non_existent_file.jpg`,
        });

      expect(res.status).toBe(400);
    });

    it('encrypts sensitive document metadata with versioned key and allows admin to view with audit log', async () => {
      const driver = await ctx.createDriver({ fullName: 'كابتن وثيقة مشفرة' });
      const admin = await ctx.createAdmin({ fullName: 'مدير فحص الوثائق' });

      // 1. Get presigned upload URL (this registers the mock upload)
      const uploadRes = await request(ctx.app.getHttpServer())
        .post('/v1/driver/documents/upload-url')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({
          mediaType: 'image/jpeg',
        });
      expect(uploadRes.status).toBe(201);
      const storageKey = uploadRes.body.storageKey;

      // 2. Submit document with sensitive metadata
      const sensitiveMeta = { nationalIdNumber: '29501011234567', issuingAuthority: 'Cairo Civil Registry' };
      const submitRes = await request(ctx.app.getHttpServer())
        .post('/v1/driver/documents')
        .set('Authorization', `Bearer ${driver.token}`)
        .send({
          type: 'national_id_front',
          storageKey,
          metadata: sensitiveMeta,
        });

      expect(submitRes.status).toBe(201);
      const documentId = submitRes.body.id;

      // 3. Verify in database that metadata is stored encrypted (not plaintext)
      const [docInDb] = await ctx.dbService.db
        .select()
        .from(verificationDocuments)
        .where(eq(verificationDocuments.id, documentId));

      expect(docInDb).toBeDefined();
      expect(typeof docInDb!.encryptedMetadata).toBe('string');
      expect((docInDb!.encryptedMetadata as string).startsWith('v1:')).toBe(true);

      // 4. Non-admin accessing document download URL -> 403 Forbidden
      const unauthorizedRes = await request(ctx.app.getHttpServer())
        .get(`/v1/admin/verifications/${documentId}/document-url`)
        .set('Authorization', `Bearer ${driver.token}`);
      expect(unauthorizedRes.status).toBe(403);

      // 5. Admin accesses document download URL -> 200 OK, decrypted metadata returned
      const adminRes = await request(ctx.app.getHttpServer())
        .get(`/v1/admin/verifications/${documentId}/document-url`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body).toHaveProperty('downloadUrl');
      expect(adminRes.body.metadata).toEqual(sensitiveMeta);

      // 6. Verify audit log was created for admin document view
      const [auditEntry] = await ctx.dbService.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, admin.user.id),
            eq(auditLogs.action, 'view_verification_document'),
            eq(auditLogs.entityId, documentId),
          ),
        );

      expect(auditEntry).toBeDefined();
    });
  });

  describe('5. Messaging (S-13) Participation, Grace Period & Admin Audit', () => {
    let orderId: string;
    let agreementId: string;
    let customer: any;
    let driver: any;
    let otherDriver: any;

    beforeAll(async () => {
      customer = await ctx.createCustomer({ fullName: 'عميل المحادثة' });
      driver = await ctx.createDriver({ fullName: 'كابتن المحادثة', hasSubscription: true });
      otherDriver = await ctx.createDriver({ fullName: 'كابتن غريب', hasSubscription: true });
      orderId = await createPublishedOrder(customer.token);

      // Driver creates offer
      const offerRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/offers`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ offeredFareMinor: 5000, notes: 'سأصل سريعاً' });
      expect(offerRes.status).toBe(201);
      const offerId = offerRes.body.id;

      // Customer accepts offer
      const acceptRes = await request(ctx.app.getHttpServer())
        .post(`/v1/offers/${offerId}/accept`)
        .set('Authorization', `Bearer ${customer.token}`);
      expect(acceptRes.status).toBe(200);
      agreementId = acceptRes.body.id;
    });

    it('rejects non-participants from sending messages in the agreement (403 Forbidden)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${otherDriver.token}`)
        .send({ content: 'مرحباً، هل يمكنني التدخل؟' });

      expect(res.status).toBe(403);
    });

    it('allows agreement customer and driver to send valid messages', async () => {
      const custMsg = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ content: 'أنا أمام البوابة' });
      expect(custMsg.status).toBe(201);

      const driverMsg = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ content: 'تمام يا فندم، دقيقتان وأصل' });
      expect(driverMsg.status).toBe(201);
    });

    it('rejects messages longer than 2000 characters', async () => {
      const longText = 'أ'.repeat(2001);
      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ content: longText });

      expect(res.status).toBe(400);
    });

    it('rejects non-participants from marking messages as read (403 Forbidden)', async () => {
      const msgRes = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ content: 'رسالة للقراءة' });
      const messageId = msgRes.body.id;

      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/messages/${messageId}/read`)
        .set('Authorization', `Bearer ${otherDriver.token}`);

      expect(res.status).toBe(403);
    });

    it('logs audit entry when admin views agreement conversation', async () => {
      const admin = await ctx.createAdmin({ fullName: 'مدير رقابة المحادثات' });

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/agreements/${agreementId}/messages`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);

      const [auditEntry] = await ctx.dbService.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, admin.user.id),
            eq(auditLogs.action, 'admin_view_conversation'),
          ),
        );

      expect(auditEntry).toBeDefined();
    });
  });

  describe('6. Ratings & Dispute Enforcement', () => {
    let orderId: string;
    let agreementId: string;
    let customer: any;
    let driver: any;

    beforeAll(async () => {
      customer = await ctx.createCustomer({ fullName: 'عميل التقييم' });
      driver = await ctx.createDriver({ fullName: 'كابتن التقييم', hasSubscription: true });
      orderId = await createPublishedOrder(customer.token);

      const offerRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/offers`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ offeredFareMinor: 4000 });
      const acceptRes = await request(ctx.app.getHttpServer())
        .post(`/v1/offers/${offerRes.body.id}/accept`)
        .set('Authorization', `Bearer ${customer.token}`);
      agreementId = acceptRes.body.id;
    });

    it('rejects rating before agreement completion (400 Bad Request)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/ratings`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          score: 5,
          comment: 'كابتن ممتاز قبل الانتهاء',
        });

      expect(res.status).toBe(400);
    });

    it('rejects invalid rating scores (< 1 or > 5)', async () => {
      // Mark agreement fulfilled (completed status in state machine)
      await ctx.dbService.db
        .update(agreements)
        .set({ status: 'fulfilled' })
        .where(eq(agreements.id, agreementId));

      const resLow = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/ratings`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ score: 0 });
      expect(resLow.status).toBe(400);

      const resHigh = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/ratings`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ score: 6 });
      expect(resHigh.status).toBe(400);
    });

    it('accepts valid rating on completed agreement and returns 409 Conflict on duplicate rating', async () => {
      // First rating
      const firstRes = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/ratings`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          score: 5,
          comment: 'خدمة ممتازة وسريعة',
        });
      expect(firstRes.status).toBe(201);

      // Duplicate rating on same agreement
      const duplicateRes = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/ratings`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          score: 4,
          comment: 'تقييم مكرر',
        });
      expect(duplicateRes.status).toBe(409);
    });
  });

  describe('7. Admin User Search, Cursor Pagination & SQL Wildcard Sanitization', () => {
    it('rejects search queries shorter than 3 characters (400 Bad Request)', async () => {
      const admin = await ctx.createAdmin({ fullName: 'مدير البحث القصير' });

      const res = await request(ctx.app.getHttpServer())
        .get('/v1/admin/users?q=ab')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(400);
    });

    it('escapes SQL wildcard characters (_ and %) and does not return unintended users', async () => {
      const admin = await ctx.createAdmin({ fullName: 'مدير بحث الرموز' });
      // Search for literal wildcard characters that should not match arbitrary strings
      const res = await request(ctx.app.getHttpServer())
        .get('/v1/admin/users?q=___')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('hasNext');
      // No user has '___' literally in their name or phone
      expect(res.body.items.length).toBe(0);
    });

    it('returns cursor-based pagination and logs audit trail for PII search', async () => {
      const admin = await ctx.createAdmin({ fullName: 'مدير التدقيق' });

      const res = await request(ctx.app.getHttpServer())
        .get('/v1/admin/users?q=تجريبي&limit=2')
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);

      // Verify audit log
      const [auditEntry] = await ctx.dbService.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.userId, admin.user.id),
            eq(auditLogs.action, 'admin_user_search_pii'),
          ),
        );

      expect(auditEntry).toBeDefined();
    });
  });

  describe('8. IDOR Prevention Across Agreements, Offers, and Execution', () => {
    it('rejects Customer B from viewing offers for Customer A order (403 Forbidden)', async () => {
      const customerA = await ctx.createCustomer({ fullName: 'صاحب عروض أ' });
      const customerB = await ctx.createCustomer({ fullName: 'متطفل عروض ب' });
      const orderId = await createPublishedOrder(customerA.token);

      const res = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}/offers`)
        .set('Authorization', `Bearer ${customerB.token}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthorized third party from proposing amendment to active agreement (403 Forbidden)', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل التعديل الأصلي' });
      const driver = await ctx.createDriver({ fullName: 'كابتن التعديل الأصلي', hasSubscription: true });
      const hacker = await ctx.createCustomer({ fullName: 'مخترق الاتفاق' });
      const orderId = await createPublishedOrder(customer.token);

      const offerRes = await request(ctx.app.getHttpServer())
        .post(`/v1/orders/${orderId}/offers`)
        .set('Authorization', `Bearer ${driver.token}`)
        .send({ offeredFareMinor: 5000 });
      const acceptRes = await request(ctx.app.getHttpServer())
        .post(`/v1/offers/${offerRes.body.id}/accept`)
        .set('Authorization', `Bearer ${customer.token}`);
      const agreementId = acceptRes.body.id;

      const res = await request(ctx.app.getHttpServer())
        .post(`/v1/agreements/${agreementId}/amendments`)
        .set('Authorization', `Bearer ${hacker.token}`)
        .send({
          newFareMinor: 100, // Maliciously lowering fare
          reason: 'محاولة اختراق',
        });

      expect(res.status).toBe(403);
    });
  });
});
