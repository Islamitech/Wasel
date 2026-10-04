import { Injectable, Inject } from '@nestjs/common';
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
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql, ilike, or } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import { maskPhone, maskEmail } from '../../common/utils/masking.js';
import {
  AdminPricingRuleDto,
  AdminEscalationRuleDto,
  AdminUserSearchQueryDto,
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

  async searchUsers(query: AdminUserSearchQueryDto) {
    const conditions: any[] = [];
    if (query.q) {
      const pattern = `%${query.q.trim()}%`;
      conditions.push(
        or(
          ilike(users.fullName, pattern),
          ilike(users.phone, pattern),
          ilike(users.email, pattern),
        ),
      );
    }

    const limit = query.limit || 20;
    const userRecords = await this.dbService.db
      .select()
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit);

    return userRecords.map((u) => ({
      id: u.id,
      fullName: u.fullName || 'مستخدم واصل',
      phoneMasked: maskPhone(u.phone),
      emailMasked: maskEmail(u.email),
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    }));
  }
}
