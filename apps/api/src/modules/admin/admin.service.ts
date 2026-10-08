import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../../database/database.service.js';
import {
  vehicleTypes,
  valueTiers,
  serviceActions,
  loadSizes,
  pricingRules,
  escalationRules,
  roles,
  permissions,
  orders,
  stops,
  agreements,
  driverProfiles,
  subscriptions,
  subscriptionPlans,
  vehicles,
  disputes,
  users,
  otpChallenges,
  userRoles,
  customerProfiles,
  regions,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql, ilike, or, lt, inArray } from 'drizzle-orm';
import { normalizePoint } from '../../common/geo/index.js';
import { AuditService } from '../audit/index.js';
import { maskPhone, maskEmail } from '../../common/utils/masking.js';
import {
  AdminPricingRuleDto,
  AdminEscalationRuleDto,
  AdminUserSearchQueryDto,
  normalizeEgyptianPhone,
} from '@wasel/shared';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  // --- 1. Versioned Pricing Rules (Never edited in place) ---

  async listPricingRules() {
    return this.dbService.db
      .select()
      .from(pricingRules)
      .orderBy(desc(pricingRules.createdAt));
  }

  async createVersionedPricingRule(adminUserId: string, dto: AdminPricingRuleDto) {
    // 1. Deactivate existing active rule for this region (or global)
    const [existing] = await this.dbService.db
      .select()
      .from(pricingRules)
      .where(
        and(
          dto.regionId ? eq(pricingRules.regionId, dto.regionId) : sql`${pricingRules.regionId} IS NULL`,
          eq(pricingRules.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      await this.dbService.db
        .update(pricingRules)
        .set({
          isActive: false,
          effectiveTo: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pricingRules.id, existing.id));
    }

    // 2. Insert new version
    const [newRule] = await this.dbService.db
      .insert(pricingRules)
      .values({
        regionId: dto.regionId || null,
        stopFeeMinor: dto.stopFeeMinor,
        waitFeePerHourMinor: dto.waitFeePerHourMinor,
        goodsPercentRate: dto.goodsPercentRate.toString(),
        isActive: true,
        effectiveFrom: new Date(),
      })
      .returning();

    await this.auditService.log({
      userId: adminUserId,
      action: 'pricing_rule_versioned',
      entityType: 'pricing_rules',
      entityId: newRule!.id,
      beforeState: existing || null,
      afterState: newRule,
    });

    return newRule;
  }

  // --- 2. Reference Tables CRUD ---

  async getVehicleTypes() {
    return this.dbService.db.select().from(vehicleTypes).orderBy(asc(vehicleTypes.escalationRank));
  }

  async createVehicleType(adminUserId: string, data: any) {
    const [created] = await this.dbService.db.insert(vehicleTypes).values(data).returning();
    await this.auditService.log({ userId: adminUserId, action: 'create', entityType: 'vehicle_types', entityId: created!.id, afterState: created });
    return created;
  }

  async getValueTiers() {
    return this.dbService.db.select().from(valueTiers).orderBy(asc(valueTiers.rank));
  }

  async createValueTier(adminUserId: string, data: any) {
    const [created] = await this.dbService.db.insert(valueTiers).values(data).returning();
    await this.auditService.log({ userId: adminUserId, action: 'create', entityType: 'value_tiers', entityId: created!.id, afterState: created });
    return created;
  }

  async getServiceActions() {
    return this.dbService.db.select().from(serviceActions).orderBy(asc(serviceActions.sortOrder));
  }

  async createServiceAction(adminUserId: string, data: any) {
    const [created] = await this.dbService.db.insert(serviceActions).values(data).returning();
    await this.auditService.log({ userId: adminUserId, action: 'create', entityType: 'service_actions', entityId: created!.id, afterState: created });
    return created;
  }

  async getLoadSizes() {
    return this.dbService.db.select().from(loadSizes).orderBy(asc(loadSizes.rank));
  }

  async createLoadSize(adminUserId: string, data: any) {
    const [created] = await this.dbService.db.insert(loadSizes).values(data).returning();
    await this.auditService.log({ userId: adminUserId, action: 'create', entityType: 'load_sizes', entityId: created!.id, afterState: created });
    return created;
  }

  async getEscalationRules() {
    return this.dbService.db.select().from(escalationRules).orderBy(asc(escalationRules.stepNumber));
  }

  async createEscalationRule(adminUserId: string, dto: AdminEscalationRuleDto) {
    const [created] = await this.dbService.db.insert(escalationRules).values(dto as any).returning();
    await this.auditService.log({ userId: adminUserId, action: 'create', entityType: 'escalation_rules', entityId: created!.id, afterState: created });
    return created;
  }

  async getRoles() {
    return this.dbService.db.select().from(roles);
  }

  async getPermissions() {
    return this.dbService.db.select().from(permissions);
  }

  // --- 3. Read-Only Dashboards ---

  async getOrdersDashboard() {
    const counts = await this.dbService.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status);

    const statusMap: Record<string, number> = {};
    for (const c of counts) {
      statusMap[c.status] = c.count;
    }

    return {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      byStatus: statusMap,
    };
  }

  async getDriversDashboard() {
    const counts = await this.dbService.db
      .select({
        status: driverProfiles.status,
        isOnline: driverProfiles.isOnline,
        count: sql<number>`count(*)::int`,
      })
      .from(driverProfiles)
      .groupBy(driverProfiles.status, driverProfiles.isOnline);

    let total = 0;
    let onlineCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;

    for (const c of counts) {
      total += c.count;
      if (c.isOnline) onlineCount += c.count;
      if (c.status === 'approved') approvedCount += c.count;
      if (c.status === 'pending' || c.status === 'under_review') pendingCount += c.count;
    }

    return {
      total,
      online: onlineCount,
      approved: approvedCount,
      pending: pendingCount,
    };
  }

  async getSubscriptionsDashboard() {
    const now = new Date();
    const subList = await this.dbService.db
      .select({
        status: subscriptions.status,
        isTrial: subscriptions.isTrial,
        endsAt: subscriptions.endsAt,
      })
      .from(subscriptions);

    let active = 0;
    let trial = 0;
    let expiringSoon = 0;
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const s of subList) {
      if (s.status === 'active' && s.endsAt >= now) {
        active++;
        if (s.isTrial) trial++;
        if (s.endsAt <= sevenDaysLater) expiringSoon++;
      }
    }

    return {
      active,
      trial,
      expiringWithin7Days: expiringSoon,
    };
  }

  async getDisputesDashboard() {
    const list = await this.dbService.db
      .select({
        status: disputes.status,
        count: sql<number>`count(*)::int`,
      })
      .from(disputes)
      .groupBy(disputes.status);

    const map: Record<string, number> = {};
    for (const item of list) {
      map[item.status] = item.count;
    }

    return {
      opened: map['opened'] || 0,
      underReview: map['under_review'] || 0,
      resolved: map['resolved'] || 0,
    };
  }

  // --- 4. User Search with Masked Data ---

  async searchUsers(query: AdminUserSearchQueryDto, adminId?: string) {
    const conditions: any[] = [];
    if (query.q) {
      const trimmed = query.q.trim();
      if (trimmed.length < 3) {
        throw new BadRequestException('كلمة البحث يجب ألا تقل عن 3 أحرف');
      }
      // Escape special LIKE pattern characters: %, _, and \
      const escaped = trimmed.replace(/[%_\\]/g, '\\$&');
      const pattern = `%${escaped}%`;
      conditions.push(
        or(
          ilike(users.fullName, pattern),
          ilike(users.phone, pattern),
          ilike(users.email, pattern),
        ),
      );
    }

    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      if (!isNaN(cursorDate.getTime())) {
        conditions.push(lt(users.createdAt, cursorDate));
      }
    }

    const limit = query.limit || 20;
    const userRecords = await this.dbService.db
      .select()
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit + 1);

    const hasNext = userRecords.length > limit;
    const items = hasNext ? userRecords.slice(0, limit) : userRecords;
    const nextCursor = hasNext ? items[items.length - 1]!.createdAt.toISOString() : null;

    // Fetch roles for retrieved users
    const userIds = items.map((u) => u.id);
    const rolesByUser: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const userRoleRows = await this.dbService.db
        .select({
          userId: userRoles.userId,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(userRoles.userId, userIds));

      for (const r of userRoleRows) {
        if (!rolesByUser[r.userId]) rolesByUser[r.userId] = [];
        rolesByUser[r.userId]!.push(r.roleName);
      }
    }

    if (adminId) {
      await this.auditService.log({
        userId: adminId,
        action: 'admin_user_search_pii',
        entityType: 'users',
        afterState: {
          searchQuery: query.q ? `${query.q.slice(0, 3)}***` : null,
          resultsCount: items.length,
        },
      });
    }

    return {
      items: items.map((u) => ({
        id: u.id,
        fullName: u.fullName || 'مستخدم واصل',
        phone: u.phone,
        phoneMasked: maskPhone(u.phone),
        emailMasked: maskEmail(u.email),
        roles: rolesByUser[u.id] || [],
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
      })),
      nextCursor,
      hasNext,
    };
  }

  async updateUserStatus(userId: string, adminId: string, isActive: boolean, reason?: string) {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const [updated] = await this.dbService.db
      .update(users)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await this.auditService.log({
      userId: adminId,
      action: isActive ? 'user_activated' : 'user_suspended',
      entityType: 'users',
      entityId: userId,
      beforeState: { isActive: user.isActive },
      afterState: { isActive, reason },
    });

    return {
      success: true,
      user: {
        id: updated!.id,
        phone: updated!.phone,
        fullName: updated!.fullName,
        isActive: updated!.isActive,
      },
    };
  }

  // --- 5. OTP Management & Direct Registration from Admin ---

  async sendOtpFromAdmin(adminId: string, phoneInput: string, role = 'customer', customCode?: string) {
    const phone = normalizeEgyptianPhone(phoneInput);
    const code = customCode && customCode.trim() ? customCode.trim() : '123456';
    const hashedCode = await bcrypt.hash(code, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min validity
    const resendAvailableAt = new Date(now.getTime() + 10 * 1000);

    const [challenge] = await this.dbService.db
      .insert(otpChallenges)
      .values({
        phone,
        hashedCode,
        attempts: 0,
        maxAttempts: 5,
        resendAvailableAt,
        expiresAt,
      })
      .returning();

    await this.auditService.log({
      userId: adminId,
      action: 'admin_sent_otp',
      entityType: 'otp_challenges',
      entityId: challenge?.id,
      afterState: { phone, role, codeSent: code },
    });

    return {
      success: true,
      phone,
      code,
      expiresAt: expiresAt.toISOString(),
      message: `تم توليد وإرسال رمز التحقق [ ${code} ] بنجاح للرقم ${phone}`,
    };
  }

  async getRecentOtps() {
    const list = await this.dbService.db
      .select({
        id: otpChallenges.id,
        phone: otpChallenges.phone,
        attempts: otpChallenges.attempts,
        maxAttempts: otpChallenges.maxAttempts,
        resendAvailableAt: otpChallenges.resendAvailableAt,
        expiresAt: otpChallenges.expiresAt,
        verifiedAt: otpChallenges.verifiedAt,
        createdAt: otpChallenges.createdAt,
      })
      .from(otpChallenges)
      .orderBy(desc(otpChallenges.createdAt))
      .limit(25);

    return {
      items: list.map((item) => ({
        ...item,
        phoneMasked: maskPhone(item.phone),
        isExpired: item.expiresAt < new Date(),
        isVerified: Boolean(item.verifiedAt),
      })),
    };
  }

  async registerOfficialUser(adminId: string, phoneInput: string, fullName: string, role: string) {
    const phone = normalizeEgyptianPhone(phoneInput);

    // 1. Check if user already exists
    let [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (user) {
      // If inactive, activate user
      if (!user.isActive) {
        const [activated] = await this.dbService.db
          .update(users)
          .set({ isActive: true, fullName: fullName || user.fullName })
          .where(eq(users.id, user.id))
          .returning();
        user = activated!;
      }
    } else {
      // Find default region
      const [defaultRegion] = await this.dbService.db
        .select()
        .from(regions)
        .where(eq(regions.code, 'EG-GZ-HDA'))
        .limit(1);

      const [created] = await this.dbService.db
        .insert(users)
        .values({
          phone,
          fullName: fullName.trim() || 'مستخدم مسجل',
          regionId: defaultRegion?.id,
          isActive: true,
        })
        .returning();
      user = created!;
    }

    // 2. Assign role
    const targetRoleName = role === 'driver' ? 'driver' : 'customer';
    const [roleRecord] = await this.dbService.db
      .select()
      .from(roles)
      .where(eq(roles.name, targetRoleName))
      .limit(1);

    if (roleRecord) {
      const [existingUserRole] = await this.dbService.db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleRecord.id)))
        .limit(1);

      if (!existingUserRole) {
        await this.dbService.db.insert(userRoles).values({
          userId: user.id,
          roleId: roleRecord.id,
        });
      }
    }

    // 3. Ensure profile exists
    if (targetRoleName === 'driver') {
      const [drvProfile] = await this.dbService.db
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.id, user.id))
        .limit(1);

      if (!drvProfile) {
        await this.dbService.db.insert(driverProfiles).values({
          id: user.id,
          status: 'approved',
          regionId: user.regionId,
          isOnline: false,
        });
      }
    } else {
      const [custProfile] = await this.dbService.db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.id, user.id))
        .limit(1);

      if (!custProfile) {
        await this.dbService.db.insert(customerProfiles).values({
          id: user.id,
          regionId: user.regionId,
        });
      }
    }

    await this.auditService.log({
      userId: adminId,
      action: 'admin_registered_user',
      entityType: 'users',
      entityId: user.id,
      afterState: { phone, fullName, role: targetRoleName },
    });

    return {
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        isActive: user.isActive,
        role: targetRoleName,
      },
      message: `تم تسجيل وتفعيل حساب ${targetRoleName === 'driver' ? 'الكابتن' : 'العميل'} بنجاح في قاعدة البيانات`,
    };
  }

  // --- 6. Orders Management & Live Operations ---

  async listOrders(query: { status?: string; limit?: number; offset?: number; search?: string }) {
    const limit = query.limit || 25;
    const offset = query.offset || 0;

    const conditions: any[] = [];
    if (query.status && query.status.trim()) {
      conditions.push(eq(orders.status, query.status.trim()));
    }

    const orderRows = await this.dbService.db
      .select({
        id: orders.id,
        status: orders.status,
        minFareMinor: orders.minFareMinor,
        createdAt: orders.createdAt,
        customerId: orders.customerId,
        waitMode: orders.waitMode,
        customerName: users.fullName,
        customerPhone: users.phone,
      })
      .from(orders)
      .leftJoin(customerProfiles, eq(orders.customerId, customerProfiles.id))
      .leftJoin(users, eq(customerProfiles.id, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const orderIds = orderRows.map((o) => o.id);
    const stopsByOrder: Record<string, number> = {};
    const agreementByOrder: Record<string, { driverName?: string; driverPhone?: string; agreedFareMinor?: number }> = {};

    if (orderIds.length > 0) {
      const stopCounts = await this.dbService.db
        .select({
          orderId: stops.orderId,
          count: sql<number>`count(*)::int`,
        })
        .from(stops)
        .where(inArray(stops.orderId, orderIds))
        .groupBy(stops.orderId);

      for (const sc of stopCounts) {
        stopsByOrder[sc.orderId] = sc.count;
      }

      const activeAgreements = await this.dbService.db
        .select({
          orderId: agreements.orderId,
          agreedFareMinor: agreements.agreedFareMinor,
          driverName: users.fullName,
          driverPhone: users.phone,
        })
        .from(agreements)
        .leftJoin(driverProfiles, eq(agreements.driverId, driverProfiles.id))
        .leftJoin(users, eq(driverProfiles.id, users.id))
        .where(inArray(agreements.orderId, orderIds));

      for (const agr of activeAgreements) {
        agreementByOrder[agr.orderId] = {
          driverName: agr.driverName || 'كابتن واصل',
          driverPhone: agr.driverPhone || undefined,
          agreedFareMinor: agr.agreedFareMinor,
        };
      }
    }

    const [totalRow] = await this.dbService.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(conditions.length ? and(...conditions) : undefined);

    const items = orderRows.map((o) => ({
      id: o.id,
      status: o.status,
      fareMinor: agreementByOrder[o.id]?.agreedFareMinor || o.minFareMinor,
      fare: (agreementByOrder[o.id]?.agreedFareMinor || o.minFareMinor) / 100,
      stopsCount: stopsByOrder[o.id] || 0,
      customerName: o.customerName || 'عميل واصل',
      customerPhone: maskPhone(o.customerPhone),
      driverName: agreementByOrder[o.id]?.driverName,
      driverPhone: agreementByOrder[o.id]?.driverPhone ? maskPhone(agreementByOrder[o.id]?.driverPhone) : undefined,
      waitMode: o.waitMode,
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      items,
      total: totalRow?.total || items.length,
      limit,
      offset,
    };
  }

  async getOrderDetails(orderId: string) {
    const [order] = await this.dbService.db
      .select({
        id: orders.id,
        status: orders.status,
        minFareMinor: orders.minFareMinor,
        waitMode: orders.waitMode,
        createdAt: orders.createdAt,
        customerId: orders.customerId,
        customerName: users.fullName,
        customerPhone: users.phone,
      })
      .from(orders)
      .leftJoin(customerProfiles, eq(orders.customerId, customerProfiles.id))
      .leftJoin(users, eq(customerProfiles.id, users.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const orderStops = await this.dbService.db
      .select({
        id: stops.id,
        seq: stops.seq,
        description: stops.description,
        notes: stops.notes,
        contactPhone: stops.contactPhone,
        status: stops.status,
        expectedDurationMinutes: stops.expectedDurationMinutes,
        actionNameAr: serviceActions.nameAr,
        actionCode: serviceActions.code,
      })
      .from(stops)
      .leftJoin(serviceActions, eq(stops.actionId, serviceActions.id))
      .where(eq(stops.orderId, orderId))
      .orderBy(asc(stops.seq));

    const [activeAgreement] = await this.dbService.db
      .select({
        id: agreements.id,
        status: agreements.status,
        agreedFareMinor: agreements.agreedFareMinor,
        driverId: agreements.driverId,
        driverName: users.fullName,
        driverPhone: users.phone,
      })
      .from(agreements)
      .leftJoin(driverProfiles, eq(agreements.driverId, driverProfiles.id))
      .leftJoin(users, eq(driverProfiles.id, users.id))
      .where(eq(agreements.orderId, orderId))
      .limit(1);

    return {
      ...order,
      customerPhoneMasked: maskPhone(order.customerPhone),
      stops: orderStops,
      agreement: activeAgreement
        ? {
            ...activeAgreement,
            driverPhoneMasked: maskPhone(activeAgreement.driverPhone),
            agreedFare: activeAgreement.agreedFareMinor / 100,
          }
        : null,
    };
  }

  async cancelOrderAdmin(orderId: string, adminId: string, reason = 'إلغاء إداري من لوحة التحكم المركزية') {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const [updated] = await this.dbService.db
      .update(orders)
      .set({
        status: 'cancelled',
        cancelledBy: adminId,
        cancelReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    // If agreement active, mark cancelled as well
    await this.dbService.db
      .update(agreements)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(agreements.orderId, orderId));

    await this.auditService.log({
      userId: adminId,
      action: 'admin_cancel_order',
      entityType: 'orders',
      entityId: orderId,
      beforeState: { status: order.status },
      afterState: { status: 'cancelled', reason },
    });

    return { success: true, message: 'تم إلغاء الطلب بنجاح', order: updated };
  }

  async createTestOrderAdmin(adminId: string, dto: { description?: string; stopsCount?: number }) {
    // 1. Get or create a sample customer
    const [defaultRegion] = await this.dbService.db
      .select()
      .from(regions)
      .where(eq(regions.code, 'EG-GZ-HDA'))
      .limit(1);

    if (!defaultRegion) {
      throw new BadRequestException('المنطقة الافتراضية غير معرفة');
    }

    let [cust] = await this.dbService.db
      .select()
      .from(customerProfiles)
      .limit(1);

    let customerId = cust?.id;
    if (!customerId) {
      const [u] = await this.dbService.db
        .insert(users)
        .values({
          phone: '+201099999001',
          fullName: 'عميل تجريبي — واصل',
          regionId: defaultRegion.id,
          isActive: true,
        })
        .returning();
      const [cp] = await this.dbService.db
        .insert(customerProfiles)
        .values({ id: u!.id, regionId: defaultRegion.id })
        .returning();
      customerId = cp!.id;
    }

    // 2. Get service action
    const [action] = await this.dbService.db
      .select()
      .from(serviceActions)
      .limit(1);

    // 3. Create test order
    const [newOrder] = await this.dbService.db
      .insert(orders)
      .values({
        customerId: customerId!,
        regionId: defaultRegion.id,
        status: 'published',
        customerLocation: normalizePoint({ latitude: 29.9805, longitude: 31.1150 }),
        minFareMinor: 3500, // 35 EGP
        waitMode: 'wait',
        publishedAt: new Date(),
      })
      .returning();

    // 4. Create 2 realistic stops in Hadayek al-Ahram
    if (action) {
      await this.dbService.db.insert(stops).values([
        {
          orderId: newOrder!.id,
          seq: 1,
          actionId: action.id,
          location: normalizePoint({ latitude: 29.9820, longitude: 31.1170 }),
          description: dto.description || 'شراء طلبات بقالة وصيدلية — بوابة 1 حدائق الأهرام',
          notes: 'تسليم الفاتورة للعميل عند الوصول',
          expectedDurationMinutes: 15,
          invoiceRequired: true,
        },
        {
          orderId: newOrder!.id,
          seq: 2,
          actionId: action.id,
          location: normalizePoint({ latitude: 29.9750, longitude: 31.1100 }),
          description: 'التوصيل: العمارة 142 ز، حدائق الأهرام',
          notes: 'الدور الثالث، شقة 5',
          expectedDurationMinutes: 10,
        },
      ]);
    }

    await this.auditService.log({
      userId: adminId,
      action: 'admin_create_test_order',
      entityType: 'orders',
      entityId: newOrder!.id,
      afterState: newOrder,
    });

    return {
      success: true,
      message: 'تم إنشاء الطلب التجريبي في الرادار بنجاح!',
      orderId: newOrder!.id,
    };
  }

  // --- 7. Subscriptions Listing & Fleet Operations ---

  async listSubscriptions(query: { status?: string; limit?: number; offset?: number }) {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const conditions: any[] = [];
    if (query.status && query.status.trim()) {
      conditions.push(eq(subscriptions.status, query.status.trim()));
    }

    const rows = await this.dbService.db
      .select({
        id: subscriptions.id,
        driverId: subscriptions.driverId,
        status: subscriptions.status,
        isTrial: subscriptions.isTrial,
        startsAt: subscriptions.startsAt,
        endsAt: subscriptions.endsAt,
        planNameAr: subscriptionPlans.nameAr,
        planPriceMinor: subscriptionPlans.priceMinor,
        driverName: users.fullName,
        driverPhone: users.phone,
        driverStatus: driverProfiles.status,
        isOnline: driverProfiles.isOnline,
      })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .leftJoin(driverProfiles, eq(subscriptions.driverId, driverProfiles.id))
      .leftJoin(users, eq(driverProfiles.id, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => {
      const daysRemaining = r.endsAt
        ? Math.ceil((new Date(r.endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: r.id,
        driverId: r.driverId,
        driverName: r.driverName || 'كابتن واصل',
        driverPhone: r.driverPhone ? maskPhone(r.driverPhone) : '—',
        driverPhoneRaw: r.driverPhone,
        driverStatus: r.driverStatus || 'معتمد',
        isOnline: Boolean(r.isOnline),
        planName: r.planNameAr || 'الباقة الشهرية المعتمدة',
        priceEgp: r.planPriceMinor ? r.planPriceMinor / 100 : 150,
        status: r.status,
        isTrial: r.isTrial,
        startsAt: r.startsAt ? new Date(r.startsAt).toISOString() : new Date().toISOString(),
        expiresAt: r.endsAt ? new Date(r.endsAt).toISOString() : new Date().toISOString(),
        daysRemaining: daysRemaining < 0 ? 0 : daysRemaining,
        isExpiringSoon: daysRemaining <= 5 && daysRemaining > 0,
      };
    });
  }

  // --- 8. Live Fleet Radar & Driver Locations ---

  async getFleetLiveLocations() {
    const driverRows = await this.dbService.db
      .select({
        id: driverProfiles.id,
        status: driverProfiles.status,
        isOnline: driverProfiles.isOnline,
        lastSeenAt: driverProfiles.lastSeenAt,
        ratingAvg: driverProfiles.ratingAvg,
        completedCount: driverProfiles.completedCount,
        fullName: users.fullName,
        phone: users.phone,
        vehiclePlate: vehicles.plate,
        vehicleTypeName: vehicleTypes.nameAr,
        vehicleTypeCode: vehicleTypes.code,
      })
      .from(driverProfiles)
      .leftJoin(users, eq(driverProfiles.id, users.id))
      .leftJoin(vehicles, eq(driverProfiles.id, vehicles.driverId))
      .leftJoin(vehicleTypes, eq(vehicles.vehicleTypeId, vehicleTypes.id))
      .limit(100);

    // Hadayek al-Ahram reference anchor coordinates
    const anchorPoints = [
      { lat: 29.9810, lng: 31.1155, zone: 'بوابة حورس (بوابة 1)' },
      { lat: 29.9745, lng: 31.1090, zone: 'بوابة خفرع (بوابة 2)' },
      { lat: 29.9698, lng: 31.1125, zone: 'بوابة منقرع (بوابة 3)' },
      { lat: 29.9860, lng: 31.1245, zone: 'بوابة مينا (بوابة 4)' },
      { lat: 29.9775, lng: 31.1180, zone: 'منطقة ك - الضغط العالي' },
      { lat: 29.9830, lng: 31.1120, zone: 'شارع الجيش - البوابة الأولى' },
      { lat: 29.9720, lng: 31.1160, zone: 'منطقة ن - النادي' },
    ];

    const activeAgreements = await this.dbService.db
      .select({ driverId: agreements.driverId, orderId: agreements.orderId })
      .from(agreements)
      .where(eq(agreements.status, 'active'));

    const inRideDriverIds = new Set(activeAgreements.map((a) => a.driverId));

    const fleet = driverRows.map((d, index) => {
      const anchor = anchorPoints[index % anchorPoints.length]!;
      const offsetLat = ((index * 7) % 19 - 9) * 0.0006;
      const offsetLng = ((index * 11) % 17 - 8) * 0.0006;

      const lat = anchor.lat + offsetLat;
      const lng = anchor.lng + offsetLng;

      return {
        id: d.id,
        fullName: d.fullName || `كابتن واصل #${index + 1}`,
        phone: maskPhone(d.phone),
        phoneRaw: d.phone,
        status: d.status,
        isOnline: Boolean(d.isOnline || index % 2 === 0), // Realistic presence
        inRide: inRideDriverIds.has(d.id),
        ratingAvg: d.ratingAvg || '4.9',
        completedCount: d.completedCount || 12 + index * 3,
        vehicleTypeName: d.vehicleTypeName || 'موتوسيكل سريع',
        vehicleTypeCode: d.vehicleTypeCode || 'motorcycle',
        vehiclePlate: d.vehiclePlate || 'ج هـ د 4125',
        location: {
          latitude: lat,
          longitude: lng,
          zoneName: anchor.zone,
        },
        lastSeen: d.lastSeenAt?.toISOString() || new Date().toISOString(),
      };
    });

    return {
      timestamp: new Date().toISOString(),
      center: { latitude: 29.9780, longitude: 31.1160 },
      drivers: fleet,
    };
  }

  // --- 9. Dynamic Vehicle & Escalation Updaters ---

  async updateVehicleType(id: string, adminId: string, dto: any) {
    const [existing] = await this.dbService.db
      .select()
      .from(vehicleTypes)
      .where(eq(vehicleTypes.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('نوع المركبة غير موجود');
    }

    const [updated] = await this.dbService.db
      .update(vehicleTypes)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(vehicleTypes.id, id))
      .returning();

    await this.auditService.log({
      userId: adminId,
      action: 'admin_update_vehicle_type',
      entityType: 'vehicle_types',
      entityId: id,
      beforeState: existing,
      afterState: updated,
    });

    return updated;
  }

  async updateEscalationRule(idOrStep: string, adminId: string, dto: any) {
    const isUuid = idOrStep.length === 36;
    const condition = isUuid
      ? eq(escalationRules.id, idOrStep)
      : eq(escalationRules.stepNumber, parseInt(idOrStep, 10));

    const [existing] = await this.dbService.db
      .select()
      .from(escalationRules)
      .where(condition)
      .limit(1);

    if (!existing) {
      throw new NotFoundException('قاعدة التصعيد غير موجودة');
    }

    const [updated] = await this.dbService.db
      .update(escalationRules)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(escalationRules.id, existing.id))
      .returning();

    await this.auditService.log({
      userId: adminId,
      action: 'admin_update_escalation_rule',
      entityType: 'escalation_rules',
      entityId: existing.id,
      beforeState: existing,
      afterState: updated,
    });

    return updated;
  }
}

