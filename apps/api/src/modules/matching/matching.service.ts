import {
  Injectable,
  Inject,
  Optional,
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
  driverLocations,
} from '../../database/schema/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { SubscriptionsFacade } from '../subscriptions/index.js';
import { VerificationFacade } from '../verification/index.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { MetricsService } from '../metrics/index.js';
import { Point, validatePoint, toGeography } from '../../common/geo/index.js';
import {
  buildPaginatedResponse,
  decodeCursor,
  PaginatedResult,
} from '../../common/pagination/cursor-pagination.helper.js';
import { ErrorCode } from '@wasel/shared';

export interface NearbyOrdersOptions {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  cursor?: string;
  limit?: number;
}

export interface NearbyOrderCard {
  orderId: string;
  minFareMinor: number;
  formattedFareEgp: string;
  distanceMeters: number;
  billableVisits: number;
  valueTierNameAr: string;
  loadSizeNameAr: string;
  stopsCount: number;
  firstStopSummary: string;
  createdAt: string;
}

@Injectable()
export class MatchingService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(SubscriptionsFacade) private readonly subsFacade: SubscriptionsFacade,
    @Inject(VerificationFacade) private readonly verificationFacade: VerificationFacade,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(RedisService) private readonly redisService: RedisService,
    @Optional() @Inject(MetricsService) private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Retrieves open nearby orders in a single, high-performance batch query.
   * Completely eliminates N+1 loops, uses PostGIS ST_DWithin and ST_Distance,
   * checks driver active subscription, vehicle fit, value tier limits, and cursor pagination.
   */
  async getNearbyOrders(
    driverId: string,
    options: NearbyOrdersOptions = {},
  ): Promise<PaginatedResult<NearbyOrderCard>> {
    const start = process.hrtime.bigint();
    // 1. Subscription check
    const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId);
    if (!isSubscribed) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'يجب تفعيل اشتراك ساري المفعول للبحث عن وتلقي الطلبات',
      });
    }

    // 2. Fetch driver profile & verify status
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

    // 3. Driver approved vehicle
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

    // 4. Resolve driver coordinates
    let driverGeo: any;
    if (options.lat !== undefined && options.lng !== undefined) {
      const point: Point = { lat: options.lat, lng: options.lng };
      validatePoint(point);
      driverGeo = toGeography(point);
    } else {
      // Find latest telemetry or fallback to driver profile lastLocation
      const [latestLoc] = await this.dbService.db
        .select({ location: driverLocations.location })
        .from(driverLocations)
        .where(eq(driverLocations.driverId, driverId))
        .orderBy(desc(driverLocations.recordedAt))
        .limit(1);

      if (latestLoc?.location) {
        driverGeo = toGeography(latestLoc.location);
      } else if (driver.lastLocation) {
        driverGeo = toGeography(driver.lastLocation);
      } else {
        return buildPaginatedResponse([], options.limit ?? 20, () => '');
      }
    }

    // 5. Radius resolution from settings
    const defaultRadius = await this.settingsService.get<number>(
      'default_radar_radius_meters',
      driver.regionId ?? undefined,
      5000,
    );
    const maxRadius = await this.settingsService.get<number>(
      'max_radar_radius_meters',
      driver.regionId ?? undefined,
      15000,
    );
    const searchRadius = Math.min(Math.max(options.radiusMeters ?? defaultRadius, 500), maxRadius);

    // 6. Declined orders (Redis + DB)
    const redisClient = this.redisService.getClient();
    let redisDeclinedIds: string[] = [];
    if (redisClient) {
      try {
        redisDeclinedIds = await redisClient.smembers(`driver:${driverId}:declined_orders`);
      } catch {
        // Continue if Redis temporarily unavailable
      }
    }

    // 7. Cursor pagination setup
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const cursorDate = options.cursor ? new Date(decodeCursor(options.cursor) || '') : null;
    const hasValidCursor = cursorDate !== null && !isNaN(cursorDate.getTime());

    // 8. Single batch query
    const allowedTiers = driverVerification.allowedValueTierIds || [];
    const hasTierFilter = allowedTiers.length > 0;

    const queryRows = await this.dbService.db.execute<{
      orderId: string;
      minFareMinor: number;
      createdAt: string;
      distanceMeters: number;
      valueTierNameAr: string | null;
      loadSizeNameAr: string | null;
      billableVisits: number;
      stopsCount: number;
      firstStopSummary: string | null;
    }>(
      sql`
      SELECT
        o.id AS "orderId",
        o.min_fare_minor AS "minFareMinor",
        o.created_at AS "createdAt",
        ROUND(extensions.ST_Distance(o.customer_location, ${driverGeo}))::int AS "distanceMeters",
        vt.name_ar AS "valueTierNameAr",
        ls.name_ar AS "loadSizeNameAr",
        app.count_billable_visits(o.id) AS "billableVisits",
        COALESCE(stop_agg.stops_count, 0) AS "stopsCount",
        stop_agg.first_stop_summary AS "firstStopSummary"
      FROM app.orders o
      LEFT JOIN app.value_tiers vt ON o.value_tier_id = vt.id
      LEFT JOIN app.load_sizes ls ON o.load_size_id = ls.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS stops_count,
          (ARRAY_AGG(COALESCE(s.description, s.notes, 'المحطة الأولى') ORDER BY s.seq ASC))[1] AS first_stop_summary
        FROM app.stops s
        WHERE s.order_id = o.id
      ) stop_agg ON true
      WHERE o.status IN ('published', 'matching', 'offers_received')
        AND (o.expires_at IS NULL OR o.expires_at > now())
        AND o.customer_id != ${driverId}::uuid
        ${driver.regionId ? sql`AND o.region_id = ${driver.regionId}::uuid` : sql``}
        AND extensions.ST_DWithin(o.customer_location, ${driverGeo}, ${searchRadius})
        AND NOT EXISTS (
          SELECT 1 FROM app.dispatch_candidates dc
          JOIN app.dispatch_runs dr ON dc.dispatch_run_id = dr.id
          WHERE dr.order_id = o.id
            AND dc.driver_id = ${driverId}::uuid
            AND dc.response = 'declined'
        )
        ${redisDeclinedIds.length > 0 ? sql`AND o.id NOT IN (${sql.join(redisDeclinedIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
        AND (
          o.value_tier_id IS NULL
          ${hasTierFilter ? sql`OR o.value_tier_id = ANY(ARRAY[${sql.join(allowedTiers.map((id) => sql`${id}::uuid`), sql`, `)}])` : sql`OR false`}
        )
        ${
          driverVehicle
            ? sql`AND (
                o.load_size_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM app.load_size_vehicle_types lsvt
                  WHERE lsvt.load_size_id = o.load_size_id
                    AND lsvt.vehicle_type_id = ${driverVehicle.vehicleTypeId}::uuid
                )
                OR ${driverVehicle.rank} >= 3
              )`
            : sql`AND o.load_size_id IS NULL`
        }
        ${hasValidCursor ? sql`AND o.created_at < ${cursorDate!.toISOString()}::timestamptz` : sql``}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ${limit + 1}
      `,
    );

    const rows = (Array.isArray(queryRows) ? queryRows : (queryRows as any).rows || []) as any[];

    const formattedCards: NearbyOrderCard[] = rows.map((r: any) => ({
      orderId: r.orderId,
      minFareMinor: Number(r.minFareMinor),
      formattedFareEgp: `${(Number(r.minFareMinor) / 100).toFixed(0)} ج.م`,
      distanceMeters: Number(r.distanceMeters),
      billableVisits: Number(r.billableVisits || 1),
      valueTierNameAr: r.valueTierNameAr || 'عادي',
      loadSizeNameAr: r.loadSizeNameAr || 'صغير',
      stopsCount: Number(r.stopsCount || 0),
      firstStopSummary: r.firstStopSummary || 'المحطة الأولى',
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    this.metricsService?.recordMatchingDuration('getNearbyOrders', durationSeconds);

    return buildPaginatedResponse(formattedCards, limit, (item) => item.createdAt);
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
      .orderBy(stops.seq);

    const visitsRes = await this.dbService.db.execute<any>(
      sql`SELECT app.count_billable_visits(${orderId}::uuid) AS visits`,
    );
    const row = visitsRes[0] || (visitsRes as any).rows?.[0] || {};
    const visits = Number(row.visits || 1);

    // Calculate real distance using PostGIS ST_Distance
    const [latestLoc] = await this.dbService.db
      .select({ location: driverLocations.location })
      .from(driverLocations)
      .where(eq(driverLocations.driverId, driverId))
      .orderBy(desc(driverLocations.recordedAt))
      .limit(1);

    const [driver] = await this.dbService.db
      .select({ lastLocation: driverProfiles.lastLocation })
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverId))
      .limit(1);

    const loc = latestLoc?.location || driver?.lastLocation;
    let distanceMeters = 0;
    if (loc && order.order.customerLocation) {
      const distRes = await this.dbService.db.execute<{ dist: number }>(
        sql`SELECT ROUND(extensions.ST_Distance(${toGeography(loc)}, ${toGeography(order.order.customerLocation)}))::int AS dist`,
      );
      const distRow = distRes[0] || (distRes as any).rows?.[0];
      distanceMeters = Number(distRow?.dist || 0);
    }

    return {
      orderId: order.order.id,
      minFareMinor: order.order.minFareMinor,
      formattedFareEgp: `${(order.order.minFareMinor / 100).toFixed(0)} ج.م`,
      distanceMeters,
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
    // 1. Record decline in Redis with 24-hour expiration
    const redisClient = this.redisService.getClient();
    if (redisClient) {
      try {
        const key = `driver:${driverId}:declined_orders`;
        await redisClient.sadd(key, orderId);
        await redisClient.expire(key, 24 * 3600);
      } catch {
        // Non-blocking
      }
    }

    // 2. Update dispatch_candidates record if matching dispatch cycle exists
    try {
      await this.dbService.db.execute(sql`
        UPDATE app.dispatch_candidates dc
        SET response = 'declined', responded_at = now()
        FROM app.dispatch_runs dr
        WHERE dc.dispatch_run_id = dr.id
          AND dr.order_id = ${orderId}::uuid
          AND dc.driver_id = ${driverId}::uuid
      `);
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message: 'تم تسجيل الاعتذار عن الطلب',
      orderId,
      driverId,
    };
  }
}

