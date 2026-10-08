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
  driverProfiles,
  subscriptions,
  disputes,
  users,
  otpChallenges,
  userRoles,
  customerProfiles,
  regions,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql, ilike, or, lt, inArray } from 'drizzle-orm';
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
}
