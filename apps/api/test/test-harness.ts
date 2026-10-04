import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import {
  users,
  roles,
  userRoles,
  customerProfiles,
  driverProfiles,
  vehicles,
  vehicleTypes,
  subscriptions,
  subscriptionPlans,
  regions,
  serviceActions,
  valueTiers,
  loadSizes,
  pricingRules,
  verificationLevels,
} from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';

export interface TestContext {
  app: INestApplication;
  dbService: DatabaseService;
  jwtService: JwtService;
  regionId: string;
  defaultActionId: string;
  defaultValueTierId: string;
  defaultLoadSizeId: string;
  defaultVehicleTypeId: string;
  createCustomer: (custom?: { phone?: string; fullName?: string }) => Promise<{
    user: any;
    token: string;
  }>;
  createDriver: (custom?: {
    phone?: string;
    fullName?: string;
    hasSubscription?: boolean;
    verificationLevelId?: string;
    vehicleTypeId?: string;
  }) => Promise<{
    user: any;
    driverProfile: any;
    vehicle: any;
    token: string;
  }>;
}

let cachedContext: TestContext | null = null;

export async function getTestContext(): Promise<TestContext> {
  if (cachedContext) {
    return cachedContext;
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('v1', {
    exclude: ['health', 'ready', 'docs'],
  });
  await app.init();

  const dbService = app.get(DatabaseService);
  const jwtService = app.get(JwtService);

  const isRealPostgres = !!(dbService as any).client;
  const engineLabel = isRealPostgres
    ? 'PostgreSQL 15+ PostGIS (Real Production Container Engine)'
    : 'PGlite (Fast In-Memory Approximation - NOT Production Proof for PostGIS GiST Indexes)';
  console.log(`\n[TEST HARNESS] Active Database Engine: ${engineLabel}`);

  // 1. Ensure basic reference data
  let [region] = await dbService.db.select().from(regions).limit(1);
  if (!region) {
    [region] = await dbService.db
      .insert(regions)
      .values({
        code: 'EG-GZ-HDA',
        nameAr: 'حدائق الأهرام',
        nameEn: 'Hadayek al-Ahram',
        isActive: true,
      })
      .returning();
  }
  const activeRegionId = region!.id;

  // Ensure Roles exist
  let [custRole] = await dbService.db.select().from(roles).where(eq(roles.name, 'customer')).limit(1);
  if (!custRole) {
    [custRole] = await dbService.db.insert(roles).values({ name: 'customer', description: 'Customer' }).returning();
  }

  let [driverRole] = await dbService.db.select().from(roles).where(eq(roles.name, 'driver')).limit(1);
  if (!driverRole) {
    [driverRole] = await dbService.db.insert(roles).values({ name: 'driver', description: 'Driver' }).returning();
  }

  // Ensure Vehicle Type
  let [vType] = await dbService.db.select().from(vehicleTypes).limit(1);
  if (!vType) {
    [vType] = await dbService.db
      .insert(vehicleTypes)
      .values({
        code: 'motorcycle',
        nameAr: 'موتوسيكل',
        maxWeightKg: 40,
        maxVolumeM3: '0.2',
        escalationRank: 1,
        active: true,
      })
      .returning();
  }

  // Ensure Service Action
  let [action] = await dbService.db.select().from(serviceActions).limit(1);
  if (!action) {
    [action] = await dbService.db
      .insert(serviceActions)
      .values({
        code: 'buy',
        nameAr: 'شراء',
        sortOrder: 1,
      })
      .returning();
  }

  // Ensure Value Tier
  let [tier] = await dbService.db.select().from(valueTiers).limit(1);
  if (!tier) {
    [tier] = await dbService.db
      .insert(valueTiers)
      .values({
        code: 'tier_under_200',
        nameAr: 'أقل من 200 ج.م',
        minMinor: 0,
        maxMinor: 20000,
        rank: 1,
      })
      .returning();
  }

  // Ensure Load Size
  let [size] = await dbService.db.select().from(loadSizes).limit(1);
  if (!size) {
    [size] = await dbService.db
      .insert(loadSizes)
      .values({
        code: 'small',
        nameAr: 'صغير',
        rank: 1,
      })
      .returning();
  }

  // Ensure Pricing Rule (10 EGP stop fee, 35 EGP wait fee, 10% goods percent rate)
  let [pricingRule] = await dbService.db.select().from(pricingRules).limit(1);
  if (!pricingRule) {
    [pricingRule] = await dbService.db
      .insert(pricingRules)
      .values({
        regionId: activeRegionId,
        stopFeeMinor: 1000, // 10 EGP
        waitFeePerHourMinor: 3500, // 35 EGP
        goodsPercentRate: '0.1000', // 10%
        isActive: true,
      })
      .returning();
  }

  // Ensure Verification Level
  let [vLevel] = await dbService.db.select().from(verificationLevels).limit(1);
  if (!vLevel) {
    [vLevel] = await dbService.db
      .insert(verificationLevels)
      .values({
        code: 'level_1',
        rank: 1,
        nameAr: 'مستوى 1 - أساسي',
        allowedValueTierIds: [tier!.id],
      })
      .returning();
  } else if (!vLevel.allowedValueTierIds?.includes(tier!.id)) {
    await dbService.db
      .update(verificationLevels)
      .set({ allowedValueTierIds: [tier!.id] })
      .where(eq(verificationLevels.id, vLevel.id));
  }

  // Ensure Subscription Plan
  let [plan] = await dbService.db.select().from(subscriptionPlans).limit(1);
  if (!plan) {
    [plan] = await dbService.db
      .insert(subscriptionPlans)
      .values({
        code: 'trial_30d',
        nameAr: 'فترة تجريبية مجانية',
        priceMinor: 0,
        durationDays: 30,
        isActive: true,
      })
      .returning();
  }

  const createCustomer = async (custom: { phone?: string; fullName?: string } = {}) => {
    const phone = custom.phone || `+2000000${Math.floor(10000 + Math.random() * 90000)}`;
    const [user] = await dbService.db
      .insert(users)
      .values({
        phone,
        fullName: custom.fullName || 'عميل تجريبي',
        regionId: activeRegionId,
        isActive: true,
      })
      .returning();

    await dbService.db.insert(customerProfiles).values({
      id: user!.id,
      regionId: activeRegionId,
    });

    await dbService.db.insert(userRoles).values({
      userId: user!.id,
      roleId: custRole!.id,
    });

    const token = jwtService.sign({
      sub: user!.id,
      phone: user!.phone,
      roles: ['customer'],
      permissions: ['orders:create', 'orders:read'],
    });

    return { user: user!, token };
  };

  const createDriver = async (custom: {
    phone?: string;
    fullName?: string;
    hasSubscription?: boolean;
    verificationLevelId?: string;
    vehicleTypeId?: string;
  } = {}) => {
    const phone = custom.phone || `+2000001${Math.floor(10000 + Math.random() * 90000)}`;
    const [user] = await dbService.db
      .insert(users)
      .values({
        phone,
        fullName: custom.fullName || 'كابتن تجريبي',
        regionId: activeRegionId,
        isActive: true,
      })
      .returning();

    const [driverProfile] = await dbService.db
      .insert(driverProfiles)
      .values({
        id: user!.id,
        regionId: activeRegionId,
        status: 'approved',
        verificationLevelId: custom.verificationLevelId !== undefined ? custom.verificationLevelId : vLevel!.id,
        isOnline: true,
        lastLocation: '29.975,31.115',
      })
      .returning();

    const [vehicle] = await dbService.db
      .insert(vehicles)
      .values({
        driverId: user!.id,
        vehicleTypeId: custom.vehicleTypeId || vType!.id,
        plate: `أ ب ج ${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'approved',
      })
      .returning();

    if (custom.hasSubscription !== false) {
      await dbService.db.insert(subscriptions).values({
        driverId: user!.id,
        planId: plan!.id,
        status: 'active',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isTrial: true,
      });
    }

    await dbService.db.insert(userRoles).values({
      userId: user!.id,
      roleId: driverRole!.id,
    });

    const token = jwtService.sign({
      sub: user!.id,
      phone: user!.phone,
      roles: ['driver'],
      permissions: ['driver:read', 'orders:accept'],
    });

    return { user: user!, driverProfile: driverProfile!, vehicle: vehicle!, token };
  };

  cachedContext = {
    app,
    dbService,
    jwtService,
    regionId: activeRegionId,
    defaultActionId: action!.id,
    defaultValueTierId: tier!.id,
    defaultLoadSizeId: size!.id,
    defaultVehicleTypeId: vType!.id,
    createCustomer,
    createDriver,
  };

  return cachedContext;
}
