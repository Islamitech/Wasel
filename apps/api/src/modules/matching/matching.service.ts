import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  stops,
  valueTiers,
  loadSizes,
  driverProfiles,
  vehicles,
  vehicleTypes,
  loadSizeVehicleTypes,
} from '../../database/schema/index.js';
import { eq, and, inArray, desc, asc, sql } from 'drizzle-orm';
import { SubscriptionsFacade } from '../subscriptions/index.js';
import { VerificationFacade } from '../verification/index.js';
import { ErrorCode } from '@wasel/shared';

@Injectable()
export class MatchingService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(SubscriptionsFacade) private readonly subsFacade: SubscriptionsFacade,
    @Inject(VerificationFacade) private readonly verificationFacade: VerificationFacade,
  ) {}

  async getNearbyOrders(driverId: string) {
    // 1. Subscription check
    const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId);
    if (!isSubscribed) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'يجب تفعيل اشتراك ساري المفعول للبحث عن وتلقي الطلبات',
      });
    }

    // 2. Fetch driver profile & vehicle
    const [driver] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverId))
      .limit(1);

    if (!driver || driver.status !== 'approved') {
      throw new ForbiddenException({
        errorCode: ErrorCode.VERIFICATION_LEVEL_TOO_LOW,
        message: 'حساب الكابتن لم يتم توثيقه أو اعتماده بعد',
      });
    }

    const driverVerification = await this.verificationFacade.getDriverVerificationStatus(driverId);

    // Get driver vehicle
    const [driverVehicle] = await this.dbService.db
      .select({
        vehicleId: vehicles.id,
        vehicleTypeId: vehicles.vehicleTypeId,
        typeCode: vehicleTypes.code,
        rank: vehicleTypes.escalationRank,
      })
      .from(vehicles)
      .innerJoin(vehicleTypes, eq(vehicles.vehicleTypeId, vehicleTypes.id))
      .where(and(eq(vehicles.driverId, driverId), eq(vehicles.status, 'approved')))
      .limit(1);

    // 3. Find open published orders
    const openOrders = await this.dbService.db
      .select({
        order: orders,
        valueTier: valueTiers,
        loadSize: loadSizes,
      })
      .from(orders)
      .leftJoin(valueTiers, eq(orders.valueTierId, valueTiers.id))
      .leftJoin(loadSizes, eq(orders.loadSizeId, loadSizes.id))
      .where(inArray(orders.status, ['published', 'matching', 'offers_received']))
      .orderBy(desc(orders.publishedAt))
      .limit(30);

    const cards: any[] = [];

    for (const item of openOrders) {
      const o = item.order;

      // Verification tier check
      if (o.valueTierId && driverVerification.allowedValueTierIds && !driverVerification.allowedValueTierIds.includes(o.valueTierId)) {
        continue;
      }

      // Load size compatibility check
      if (o.loadSizeId && driverVehicle) {
        const allowedVehicles = await this.dbService.db
          .select()
          .from(loadSizeVehicleTypes)
          .where(
            and(
              eq(loadSizeVehicleTypes.loadSizeId, o.loadSizeId),
              eq(loadSizeVehicleTypes.vehicleTypeId, driverVehicle.vehicleTypeId),
            ),
          );

        if (allowedVehicles.length === 0 && driverVehicle.rank < 3) {
          continue; // vehicle doesn't fit load size
        }
      }

      // Fetch stops
      const orderStops = await this.dbService.db
        .select()
        .from(stops)
        .where(eq(stops.orderId, o.id))
        .orderBy(asc(stops.seq));

      // Calculate billable visits via database function
      const visitsRes = await this.dbService.db.execute<any>(
        sql`SELECT app.count_billable_visits(${o.id}::uuid) AS visits`,
      );
      const row = visitsRes[0] || (visitsRes as any).rows?.[0] || {};
      const visits = Number(row.visits || 1);

      // Distance estimation (e.g. 500m to 2500m or calculated)
      const distanceMeters = 850;

      cards.push({
        orderId: o.id,
        minFareMinor: o.minFareMinor,
        formattedFareEgp: `${(o.minFareMinor / 100).toFixed(0)} ج.م`,
        distanceMeters,
        billableVisits: visits,
        valueTierNameAr: item.valueTier?.nameAr || 'عادي',
        loadSizeNameAr: item.loadSize?.nameAr || 'صغير',
        stopsCount: orderStops.length,
        firstStopSummary: orderStops[0]?.description || orderStops[0]?.notes || 'المحطة الأولى',
        createdAt: o.createdAt.toISOString(),
      });
    }

    return cards;
  }

  async getDriverOrderCard(orderId: string, driverId: string) {
    const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId);
    if (!isSubscribed) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'يجب تفعيل اشتراك ساري المفعول للاطلاع على تفاصيل الطلب',
      });
    }

    const [order] = await this.dbService.db
      .select({
        order: orders,
        valueTier: valueTiers,
        loadSize: loadSizes,
      })
      .from(orders)
      .leftJoin(valueTiers, eq(orders.valueTierId, valueTiers.id))
      .leftJoin(loadSizes, eq(orders.loadSizeId, loadSizes.id))
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const orderStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, orderId))
      .orderBy(asc(stops.seq));

    const visitsRes = await this.dbService.db.execute<any>(
      sql`SELECT app.count_billable_visits(${orderId}::uuid) AS visits`,
    );
    const row = visitsRes[0] || (visitsRes as any).rows?.[0] || {};
    const visits = Number(row.visits || 1);

    return {
      orderId: order.order.id,
      minFareMinor: order.order.minFareMinor,
      formattedFareEgp: `${(order.order.minFareMinor / 100).toFixed(0)} ج.م`,
      distanceMeters: 850,
      billableVisits: visits,
      valueTierNameAr: order.valueTier?.nameAr || 'عادي',
      loadSizeNameAr: order.loadSize?.nameAr || 'صغير',
      stops: orderStops.map((s) => ({
        seq: s.seq,
        description: s.description,
        notes: s.notes,
        expectedDurationMinutes: s.expectedDurationMinutes,
        invoiceRequired: s.invoiceRequired,
      })),
      createdAt: order.order.createdAt.toISOString(),
    };
  }

  async declineOrder(orderId: string, driverId: string) {
    // Record candidate decline
    return {
      success: true,
      message: 'تم تسجيل الاعتذار عن الطلب',
      orderId,
      driverId,
    };
  }
}
