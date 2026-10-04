import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  users,
  driverProfiles,
  orders,
  agreements,
  ratings,
  notifications,
  sessions,
  pushSubscriptions,
} from '../../database/schema/index.js';
import { eq, or, and, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  getPrivacyPolicy() {
    return {
      title: 'سياسة الخصوصية وحماية البيانات الشخصية — منصة واصل (Wasel)',
      effectiveDate: '2026-10-01',
      version: '1.0',
      jurisdiction: 'جمهورية مصر العربية — قانون حماية البيانات الشخصية رقم 151 لسنة 2020',
      controller: 'منصة واصل للخدمات اللوجستية والنقل التشاركي بحدائق الأهرام',
      sections: [
        {
          id: 'data_collected',
          heading: '1. البيانات التي نجمعها',
          content:
            'نجمع فقط الحد الأدنى اللازم لتقديم الخدمة اللوجستية: رقم الهاتف للتحقق، الاسم الثنائي، والموقع الجغرافي الدقيق للكباتن أثناء تفعيل وضع العمل أو تنفيذ الرحلات فقط. بالنسبة للكباتن المعتمدين، نجمع صور التراخيص وبطاقة الرقم القومي ويتم تشفيرها خادمياً وفق معيار AES-256-GCM.',
        },
        {
          id: 'purpose',
          heading: '2. أغراض معالجة البيانات',
          content:
            'تُستخدم البيانات حصراً لأغراض: مطابقة طلبات التوصيل جغرافياً، احتساب الأجرة العادلة، التواصل بين العميل والكابتن أثناء الرحلة عبر قناة مشفرة، والتحقق من أهلية وأمان النقل. لا نقوم إطلاقاً ببيع أو تأجير أي بيانات شخصية لأطراف ثالثة.',
        },
        {
          id: 'location_privacy',
          heading: '3. خصوصية الموقع الجغرافي',
          content:
            'لا يُعرض الموقع الدقيق للعميل للكباتن في رادار البحث قبل قبول الطلب، بل يتم تعتيم الإحداثيات وتجميعها على شبكة تقريبية (~300 متر). يتوقف تتبع موقع الكابتن تلقائياً بمجرد إيقاف وضع العمل (Offline) أو إغلاق التطبيق.',
        },
        {
          id: 'data_retention',
          heading: '4. سياسة الاحتفاظ بالبيانات',
          content:
            'تُحفظ تسجيلات المحادثات الصوتية والصور المرتبطة بالمحطات لمدة 7 أيام عمل من تاريخ إنجاز الطلب ثم تُحذف آلياً. وتُحفظ سجلات التدقيق والمحاسبة المالية النقدية للمدد القانونية المقررة بالتشريعات الضريبية والتجارية.',
        },
        {
          id: 'user_rights',
          heading: '5. حقوق المستخدم (الوصول، التصدير، والحذف)',
          content:
            'يحق لكل مستخدم في أي وقت: (أ) طلب نسخة كاملة بصيغة قابلة للقراءة من كافة بياناته عبر خيار تصدير البيانات، (ب) تصحيح أي بيانات غير دقيقة، (ج) ممارسة الحق في النسيان ومحو الحساب نهائياً عبر زر حذف الحساب من الإعدادات.',
        },
      ],
    };
  }

  getTermsOfService() {
    return {
      title: 'الشروط والأحكام العامة للاستخدام — منصة واصل',
      effectiveDate: '2026-10-01',
      version: '1.0',
      summary:
        'واصل هي منصة وساطة تقنية وسوق لوجستي محلي يربط سكان ومحلات حدائق الأهرام بسائقي المركبات الخفيفة المستقلين. المنصة لا تقدم خدمات نقل مباشرة ولا تتقاضى أي عمولات على البضائع.',
      rules: [
        'المعاملات المالية لقيمة البضائع والأجرة تتم نقداً بالكامل مباشرة بين العميل والكابتن عند الاستلام والتسليم.',
        'يلتزم الكابتن بوجود اشتراك نشط ورخصة قيادة سارية ومطابقة مواصفات المركبة المسجلة.',
        'يحظر نقل المواد الممنوعة قانوناً أو البضائع القابلة للاشتعال أو الخطرة.',
        'تخضع النزاعات لنظام التحكيم الداخلي للمنصة مع حق اللجوء للقضاء المختص بمحافظة الجيزة.',
      ],
    };
  }

  async exportUserData(userId: string) {
    const [user] = await this.dbService.db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        fullName: users.fullName,
        regionId: users.regionId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    // Driver profile if available
    const [driver] = await this.dbService.db
      .select({
        id: driverProfiles.id,
        status: driverProfiles.status,
        ratingAvg: driverProfiles.ratingAvg,
        ratingCount: driverProfiles.ratingCount,
        completedCount: driverProfiles.completedCount,
        createdAt: driverProfiles.createdAt,
      })
      .from(driverProfiles)
      .where(eq(driverProfiles.id, userId))
      .limit(1);

    // Customer orders
    const userOrders = await this.dbService.db
      .select({
        id: orders.id,
        status: orders.status,
        waitMode: orders.waitMode,
        minFareMinor: orders.minFareMinor,
        createdAt: orders.createdAt,
        completedAt: orders.completedAt,
      })
      .from(orders)
      .where(eq(orders.customerId, userId))
      .limit(100);

    // Agreements
    const userAgreements = await this.dbService.db
      .select({
        id: agreements.id,
        orderId: agreements.orderId,
        status: agreements.status,
        agreedFareMinor: agreements.agreedFareMinor,
        createdAt: agreements.createdAt,
      })
      .from(agreements)
      .where(or(eq(agreements.customerId, userId), eq(agreements.driverId, userId)))
      .limit(100);

    // Ratings
    const userRatings = await this.dbService.db
      .select({
        id: ratings.id,
        score: ratings.score,
        comment: ratings.comment,
        createdAt: ratings.createdAt,
      })
      .from(ratings)
      .where(eq(ratings.reviewerId, userId))
      .limit(50);

    // Notifications
    const userNotifs = await this.dbService.db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        type: notifications.type,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .limit(50);

    await this.auditService.log({
      userId,
      action: 'user_data_exported',
      entityType: 'users',
      entityId: userId,
      afterState: { exportTimestamp: new Date().toISOString() },
    });

    return {
      exportMetadata: {
        platform: 'Wasel Logistics Platform',
        legalBasis: 'Egyptian Law 151/2020 Art. 12 (Right to Data Portability)',
        generatedAt: new Date().toISOString(),
        userId,
      },
      profile: user,
      driverProfile: driver || null,
      orders: userOrders,
      agreements: userAgreements,
      ratings: userRatings,
      notifications: userNotifs,
    };
  }

  async deleteUserAccount(userId: string, reason?: string) {
    // 1. Check for in-flight active orders or agreements
    const activeOrders = await this.dbService.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, userId),
          inArray(orders.status, ['published', 'agreed', 'in_progress']),
        ),
      );

    if (activeOrders.length > 0) {
      throw new ConflictException(
        'لا يمكن إغلاق الحساب في الوقت الحالي لوجود طلبات نشطة قيد التنفيذ',
      );
    }

    const activeAgreements = await this.dbService.db
      .select({ id: agreements.id, status: agreements.status })
      .from(agreements)
      .where(
        and(
          or(eq(agreements.customerId, userId), eq(agreements.driverId, userId)),
          inArray(agreements.status, ['active']),
        ),
      );

    if (activeAgreements.length > 0) {
      throw new ConflictException(
        'لا يمكن إغلاق الحساب في الوقت الحالي لوجود رحلات جارية قيد التنفيذ',
      );
    }

    // 2. Anonymize user & soft-delete inside an ACID transaction
    return await this.dbService.transaction(
      async (tx) => {
        const deletedPhone = `del_${Date.now().toString(36)}_${userId.slice(0, 6)}`;
        const deletedEmail = `deleted_${userId.slice(0, 8)}_${Date.now()}@deleted.wasel.local`;

        await tx
          .update(users)
          .set({
            fullName: 'مستخدم محذوف',
            phone: deletedPhone,
            email: deletedEmail,
            passwordHash: null,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        // Deactivate driver profile if exists
        await tx
          .update(driverProfiles)
          .set({
            status: 'suspended',
            isOnline: false,
            updatedAt: new Date(),
          })
          .where(eq(driverProfiles.id, userId));

        // Revoke active sessions
        await tx
          .update(sessions)
          .set({
            revokedAt: new Date(),
          })
          .where(eq(sessions.userId, userId));

        // Delete push subscriptions
        await tx
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, userId));

        await this.auditService.log(
          {
            userId,
            action: 'user_account_deleted',
            entityType: 'users',
            entityId: userId,
            afterState: { reason: reason || 'user_requested_erasure' },
          },
          tx,
        );

        return {
          success: true,
          message: 'تم إغلاق الحساب ومحو البيانات الشخصية بنجاح وفقاً لأحكام القانون',
        };
      },
      { actor: 'system' },
    );
  }
}
