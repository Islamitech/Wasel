import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  stops,
  orderMedia,
  invoices,
  agreements,
  offers,
  pricingRules,
  valueTiers,
  vehicleTypes,
  loadSizeVehicleTypes,
  settings,
  driverProfiles,
  customerProfiles,
  users,
  regions,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { normalizePoint, isPointInsidePolygon, obfuscatePoint } from '../../common/geo/index.js';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { S3StorageService } from '../../common/storage/s3-storage.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { SubscriptionsFacade } from '../subscriptions/index.js';
import { VerificationFacade } from '../verification/index.js';
import { maskPhone } from '../../common/utils/masking.js';
import {
  CreateOrderDto,
  UpdateOrderDto,
  CreateOrderStopDto,
  CancelOrderDto,
  OrderListQueryDto,
  OrderUploadUrlRequestDto,
  ErrorCode,
  UserRole,
} from '@wasel/shared';
import * as crypto from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(S3StorageService) private readonly storageService: S3StorageService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(SubscriptionsFacade) private readonly subsFacade: SubscriptionsFacade,
    @Inject(VerificationFacade) private readonly verificationFacade: VerificationFacade,
  ) {}

  async createDraftOrder(customerId: string, dto: CreateOrderDto) {
    // 1. Enforce max tasks per order setting
    const maxTasks = await this.settingsService.get<number>('max_tasks_per_order', undefined, 8);
    if (dto.stops.length > maxTasks) {
      throw new BadRequestException({
        errorCode: ErrorCode.MAX_STOPS_EXCEEDED,
        message: `لا يمكن أن تحتوي الطلبية على أكثر من ${maxTasks} مهام`,
        details: { maxAllowed: maxTasks, received: dto.stops.length },
      });
    }

    // 2. Resolve region strictly from app.regions (not users)
    let regionId = dto.regionId;
    let activeRegion: typeof regions.$inferSelect | undefined;

    if (regionId) {
      [activeRegion] = await this.dbService.db
        .select()
        .from(regions)
        .where(and(eq(regions.id, regionId), eq(regions.isActive, true)))
        .limit(1);

      if (!activeRegion) {
        throw new BadRequestException('المنطقة المحددة غير صالحة أو غير مفعلة');
      }
    } else {
      [activeRegion] = await this.dbService.db
        .select()
        .from(regions)
        .where(eq(regions.isActive, true))
        .limit(1);

      if (!activeRegion) {
        throw new BadRequestException('لا توجد منطقة تشغيلية مفعلة حالياً');
      }
      regionId = activeRegion.id;
    }

    // Validate customer location coordinates and operating region coverage
    const customerPoint = normalizePoint(dto.customerLocation);
    if (activeRegion.polygonGeojson) {
      const isInside = isPointInsidePolygon(customerPoint, activeRegion.polygonGeojson);
      if (!isInside) {
        throw new BadRequestException({
          errorCode: ErrorCode.LOCATION_OUTSIDE_REGION,
          message: 'موقع الطلب خارج النطاق الجغرافي للمنطقة المحددة',
        });
      }
    }

    // 3. Atomically create profile, draft order, stops and outbox event in transaction
    const newOrderId = await this.dbService.transaction(
      async (tx) => {
        // Ensure customer profile exists
        const [custProfile] = await tx
          .select()
          .from(customerProfiles)
          .where(eq(customerProfiles.id, customerId))
          .limit(1);

        if (!custProfile) {
          await tx.insert(customerProfiles).values({ id: customerId, regionId });
        }

        // Insert order
        const [newOrder] = await tx
          .insert(orders)
          .values({
            regionId: regionId!,
            customerId,
            status: 'draft',
            valueTierId: dto.valueTierId,
            loadSizeId: dto.loadSizeId,
            waitMode: dto.waitMode || 'wait',
            customerLocation: customerPoint,
            minFareMinor: 0,
          })
          .returning();

        // Insert stops sequentially
        for (let i = 0; i < dto.stops.length; i++) {
          const s = dto.stops[i]!;
          const stopPoint = normalizePoint(s.location);
          await tx.insert(stops).values({
            orderId: newOrder!.id,
            seq: s.seq || i + 1,
            actionId: s.actionId,
            placeId: s.placeId,
            location: stopPoint,
            description: s.description,
            contactPhone: s.contactPhone,
            notes: s.notes,
            expectedDurationMinutes: s.expectedDurationMinutes || 0,
            invoiceRequired: s.invoiceRequired || false,
            status: 'pending',
          });
        }

        // Emit event via transactional outbox inside tx
        await this.eventBus.publish(tx, 'order.created', newOrder!.id, {
          orderId: newOrder!.id,
          customerId,
          stopsCount: dto.stops.length,
        });

        return newOrder!.id;
      },
      { actor: 'customer' },
    );

    return this.getOrderDetails(newOrderId, customerId, [UserRole.CUSTOMER]);
  }

  async updateDraftOrder(orderId: string, customerId: string, dto: UpdateOrderDto) {
    const order = await this.getOwnedDraftOrder(orderId, customerId);

    const [updated] = await this.dbService.db
      .update(orders)
      .set({
        ...(dto.valueTierId !== undefined ? { valueTierId: dto.valueTierId } : {}),
        ...(dto.loadSizeId !== undefined ? { loadSizeId: dto.loadSizeId } : {}),
        ...(dto.waitMode !== undefined ? { waitMode: dto.waitMode } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    return this.getOrderDetails(updated!.id, customerId, [UserRole.CUSTOMER]);
  }

  async addStop(orderId: string, customerId: string, dto: CreateOrderStopDto) {
    const order = await this.getOwnedDraftOrder(orderId, customerId);

    const existingStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, order.id));

    const [maxTasksSetting] = await this.dbService.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'max_tasks_per_order'))
      .limit(1);

    const maxTasks = Number((maxTasksSetting?.value as any)?.value || maxTasksSetting?.value || 8);
    if (existingStops.length >= maxTasks) {
      throw new BadRequestException({
        errorCode: ErrorCode.MAX_STOPS_EXCEEDED,
        message: `لا يمكن إضافة محطة جديدة، تجاوزت الحد الأقصى (${maxTasks})`,
      });
    }

    const nextSeq = dto.seq || existingStops.length + 1;
    const stopPoint = normalizePoint(dto.location);

    const [newStop] = await this.dbService.db
      .insert(stops)
      .values({
        orderId: order.id,
        seq: nextSeq,
        actionId: dto.actionId,
        placeId: dto.placeId,
        location: stopPoint,
        description: dto.description,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
        expectedDurationMinutes: dto.expectedDurationMinutes || 0,
        invoiceRequired: dto.invoiceRequired || false,
        status: 'pending',
      })
      .returning();

    return newStop;
  }

  async deleteStop(orderId: string, stopId: string, customerId: string) {
    const order = await this.getOwnedDraftOrder(orderId, customerId);

    await this.dbService.db
      .delete(stops)
      .where(and(eq(stops.id, stopId), eq(stops.orderId, order.id)));

    return { success: true, message: 'تم حذف المحطة بنجاح' };
  }

  async quoteOrder(orderId: string, userId?: string, rolesList: string[] = []) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (userId) {
      const isAdmin = rolesList.includes(UserRole.ADMIN);
      const isOwner = order.customerId === userId;

      if (!isAdmin && !isOwner) {
        const isDriver = rolesList.includes(UserRole.DRIVER);
        if (!isDriver) {
          throw new ForbiddenException({
            errorCode: ErrorCode.OWNERSHIP_VIOLATION,
            message: 'غير مصرح لك باستعراض تسعير هذا الطلب',
          });
        }

        const isSubscribed = await this.subsFacade.isDriverSubscribed(userId);
        if (!isSubscribed) {
          throw new ForbiddenException({
            errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
            message: 'يجب تفعيل اشتراك ساري المفعول للاطلاع على تسعير الطلب',
          });
        }

        const [driver] = await this.dbService.db
          .select()
          .from(driverProfiles)
          .where(eq(driverProfiles.id, userId))
          .limit(1);

        if (!driver || driver.status !== 'approved') {
          throw new ForbiddenException({
            errorCode: ErrorCode.VERIFICATION_LEVEL_TOO_LOW,
            message: 'حساب الكابتن لم يتم توثيقه أو اعتماده بعد',
          });
        }

        const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
          userId,
          order.valueTierId,
        );
        if (!isEligible) {
          throw new ForbiddenException({
            errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
            message: 'مستوى توثيق الكابتن لا يسمح بالاطلاع على تسعير هذا الطلب',
          });
        }

        if (driver.regionId && order.regionId && driver.regionId !== order.regionId) {
          throw new ForbiddenException({
            errorCode: ErrorCode.LOCATION_OUTSIDE_REGION,
            message: 'الطلب خارج نطاق تغطية منطقة الكابتن',
          });
        }
      }
    }

    // Call database SQL functions directly:
    // app.calculate_min_fare and app.count_billable_visits
    const fareRes = await this.dbService.db.execute<any>(
      sql`SELECT app.calculate_min_fare(${orderId}::uuid) AS min_fare, app.count_billable_visits(${orderId}::uuid) AS visits`,
    );

    const row = fareRes[0] || (fareRes as any).rows?.[0] || {};
    const minFareMinor = Number(row.min_fare || 0);
    const billableVisits = Number(row.visits || 0);

    // Expected wait hours
    const orderStops = await this.dbService.db
      .select({ expectedDuration: stops.expectedDurationMinutes })
      .from(stops)
      .where(eq(stops.orderId, orderId));

    const totalMinutes = orderStops.reduce((sum, s) => sum + (s.expectedDuration || 0), 0);
    const expectedWaitHours = totalMinutes / 60;

    // Pricing Rule
    const [rule] = await this.dbService.db
      .select()
      .from(pricingRules)
      .where(eq(pricingRules.isActive, true))
      .orderBy(desc(pricingRules.effectiveFrom))
      .limit(1);

    const stopFeeUnit = rule?.stopFeeMinor || 1000;
    const waitFeeUnit = rule?.waitFeePerHourMinor || 3500;
    const goodsRate = Number(rule?.goodsPercentRate || 0.1);

    let tierMinMinor = 0;
    if (order.valueTierId) {
      const [tier] = await this.dbService.db
        .select()
        .from(valueTiers)
        .where(eq(valueTiers.id, order.valueTierId))
        .limit(1);
      tierMinMinor = tier?.minMinor || 0;
    }

    const visitsFeeMinor = billableVisits * stopFeeUnit;
    const waitFeeMinor = Math.round(expectedWaitHours * waitFeeUnit);
    const goodsCommissionMinor = Math.round(tierMinMinor * goodsRate);

    // Suggested vehicle classes
    let suggestedVehicles: string[] = ['motorcycle', 'tricycle'];
    if (order.loadSizeId) {
      const matched = await this.dbService.db
        .select({ code: vehicleTypes.code })
        .from(loadSizeVehicleTypes)
        .innerJoin(vehicleTypes, eq(loadSizeVehicleTypes.vehicleTypeId, vehicleTypes.id))
        .where(eq(loadSizeVehicleTypes.loadSizeId, order.loadSizeId));
      if (matched.length > 0) {
        suggestedVehicles = matched.map((m) => m.code);
      }
    }

    return {
      orderId,
      minFareMinor,
      billableVisits,
      expectedWaitHours,
      suggestedVehicleClasses: suggestedVehicles,
      breakdown: {
        visitsFeeMinor,
        waitFeeMinor,
        goodsCommissionMinor,
        totalFareMinor: minFareMinor,
        currency: 'EGP',
        formattedFareEgp: `${(minFareMinor / 100).toFixed(0)} ج.م`,
      },
    };
  }

  async publishOrder(orderId: string, customerId: string) {
    const order = await this.getOwnedDraftOrder(orderId, customerId);

    const orderStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, order.id));

    if (orderStops.length === 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.ORDER_NOT_PUBLISHABLE,
        message: 'لا يمكن نشر طلب فارغ، يجب إضافة محطة واحدة على الأقل',
      });
    }

    // Quote and freeze pricing snapshot
    const quote = await this.quoteOrder(orderId, customerId, [UserRole.CUSTOMER]);

    const orderTtlMinutes = await this.settingsService.getOrderTtlMinutes(order.regionId);
    const publishedAt = new Date();
    const expiresAt = new Date(publishedAt.getTime() + orderTtlMinutes * 60 * 1000);

    const pricingSnapshot = {
      frozenAt: publishedAt.toISOString(),
      minFareMinor: quote.minFareMinor,
      billableVisits: quote.billableVisits,
      expectedWaitHours: quote.expectedWaitHours,
      breakdown: quote.breakdown,
    };

    // Update order status atomically in transaction (triggers guard_status_transition)
    await this.dbService.transaction(
      async (tx) => {
        const [lockedOrder] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, order.id))
          .for('update');

        if (!lockedOrder || lockedOrder.status !== 'draft') {
          throw new ConflictException({
            errorCode: ErrorCode.ILLEGAL_TRANSITION,
            message: 'لا يمكن نشر طلب غير موجود أو تم نشره مسبقاً',
          });
        }

        const [published] = await tx
          .update(orders)
          .set({
            status: 'published',
            minFareMinor: quote.minFareMinor,
            pricingSnapshot,
            publishedAt,
            expiresAt,
            updatedAt: publishedAt,
          })
          .where(eq(orders.id, order.id))
          .returning();

        // Transactional outbox event within same tx
        await this.eventBus.publish(tx, 'order.published', published!.id, {
          orderId: published!.id,
          customerId,
          regionId: published!.regionId,
          minFareMinor: quote.minFareMinor,
          suggestedVehicles: quote.suggestedVehicleClasses,
          expiresAt: expiresAt.toISOString(),
        });
      },
      { actor: 'customer' },
    );

    return this.getOrderDetails(order.id, customerId, [UserRole.CUSTOMER]);
  }

  async cancelOrder(orderId: string, userId: string, dto: CancelOrderDto, rolesList: string[]) {
    const isAdmin = rolesList.includes(UserRole.ADMIN);

    return await this.dbService.transaction(
      async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!order) {
          throw new NotFoundException('الطلب غير موجود');
        }

        if (!isAdmin && order.customerId !== userId) {
          throw new ForbiddenException({
            errorCode: ErrorCode.OWNERSHIP_VIOLATION,
            message: 'غير مصرح لك بإلغاء هذا الطلب',
          });
        }

        if (order.status === 'completed' || order.status === 'cancelled') {
          throw new ConflictException({
            errorCode: ErrorCode.ILLEGAL_TRANSITION,
            message: 'لا يمكن إلغاء طلب تم إكماله أو إلغاؤه مسبقاً',
          });
        }

        // Atomically cancel active agreement if exists
        await tx
          .update(agreements)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(agreements.orderId, orderId), eq(agreements.status, 'active')));

        // Atomically reject any pending offers
        await tx
          .update(offers)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(and(eq(offers.orderId, orderId), eq(offers.status, 'pending')));

        const [cancelled] = await tx
          .update(orders)
          .set({
            status: 'cancelled',
            cancelledBy: userId,
            cancelReason: dto.reason,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId))
          .returning();

        await this.eventBus.publish(tx, 'order.cancelled', orderId, {
          orderId,
          cancelledBy: userId,
          reason: dto.reason,
        });

        return cancelled;
      },
      { actor: isAdmin ? 'admin' : 'customer' },
    );
  }

  async listCustomerOrders(customerId: string, query: OrderListQueryDto) {
    const conditions = [eq(orders.customerId, customerId)];
    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }

    const limit = query.limit || 20;
    const userOrders = await this.dbService.db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return userOrders.map((o) => ({
      id: o.id,
      status: o.status,
      minFareMinor: o.minFareMinor,
      formattedFareEgp: `${(o.minFareMinor / 100).toFixed(0)} ج.م`,
      createdAt: o.createdAt.toISOString(),
      publishedAt: o.publishedAt?.toISOString() || null,
    }));
  }

  async getOrderDetails(orderId: string, userId: string, rolesList: string[]) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, orderId))
      .limit(1);

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isOwner = order.customerId === userId;
    const isAgreementDriver = agreement?.driverId === userId;

    if (!isAdmin && !isOwner && !isAgreementDriver) {
      // Must be an eligible, subscribed driver, belonging to same region, with order in open status
      const isDriverRole = rolesList.includes(UserRole.DRIVER);
      if (!isDriverRole) {
        throw new ForbiddenException({
          errorCode: ErrorCode.OWNERSHIP_VIOLATION,
          message: 'غير مصرح لك باستعراض تفاصيل هذه الطلبية',
        });
      }

      if (order.status !== 'published' && order.status !== 'matching' && order.status !== 'offers_received') {
        throw new ForbiddenException({
          errorCode: ErrorCode.OWNERSHIP_VIOLATION,
          message: 'الطلب غير متاح للاستعراض العام',
        });
      }

      const isSubscribed = await this.subsFacade.isDriverSubscribed(userId);
      if (!isSubscribed) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
          message: 'يجب تفعيل اشتراك ساري المفعول للاطلاع على رادار الطلبات',
        });
      }

      const [driver] = await this.dbService.db
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.id, userId))
        .limit(1);

      if (!driver || driver.status !== 'approved') {
        throw new ForbiddenException({
          errorCode: ErrorCode.VERIFICATION_LEVEL_TOO_LOW,
          message: 'حساب الكابتن لم يتم توثيقه أو اعتماده بعد',
        });
      }

      const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
        userId,
        order.valueTierId,
      );
      if (!isEligible) {
        throw new ForbiddenException({
          errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
          message: 'مستوى توثيق الكابتن لا يؤهله للاطلاع على هذا الطلب',
        });
      }

      if (driver.regionId && order.regionId && driver.regionId !== order.regionId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.LOCATION_OUTSIDE_REGION,
          message: 'الطلب خارج نطاق تغطية منطقة الكابتن',
        });
      }

      // Return OrderRadarView for Driver:
      // NO customerId, NO customerName, NO customerPhone, Obfuscated location (~300m grid)
      const resolutionMeters = await this.settingsService.getLocationObfuscationResolutionMeters(order.regionId);
      const rawCustLoc = normalizePoint(order.customerLocation);
      const obfuscatedCustLoc = obfuscatePoint(rawCustLoc, resolutionMeters);

      const [customerUser] = await this.dbService.db
        .select()
        .from(users)
        .where(eq(users.id, order.customerId))
        .limit(1);

      const orderStops = await this.dbService.db
        .select()
        .from(stops)
        .where(eq(stops.orderId, orderId))
        .orderBy(asc(stops.seq));

      return {
        id: order.id,
        regionId: order.regionId,
        isRadarView: true,
        status: order.status,
        valueTierId: order.valueTierId,
        loadSizeId: order.loadSizeId,
        waitMode: order.waitMode,
        customerPhoneMasked: maskPhone(customerUser?.phone),
        customerLocation: {
          latitude: obfuscatedCustLoc.lat,
          longitude: obfuscatedCustLoc.lng,
          lat: obfuscatedCustLoc.lat,
          lng: obfuscatedCustLoc.lng,
        },
        minFareMinor: order.minFareMinor,
        pricingSnapshot: order.pricingSnapshot,
        publishedAt: order.publishedAt?.toISOString() || null,
        expiresAt: order.expiresAt?.toISOString() || null,
        stops: orderStops.map((s) => {
          const rawStopLoc = normalizePoint(s.location);
          const obfStopLoc = obfuscatePoint(rawStopLoc, resolutionMeters);
          return {
            id: s.id,
            seq: s.seq,
            actionId: s.actionId,
            placeId: s.placeId,
            location: {
              latitude: obfStopLoc.lat,
              longitude: obfStopLoc.lng,
              lat: obfStopLoc.lat,
              lng: obfStopLoc.lng,
            },
            description: s.description,
            notes: s.notes,
            expectedDurationMinutes: s.expectedDurationMinutes,
            invoiceRequired: s.invoiceRequired,
            status: s.status,
          };
        }),
        createdAt: order.createdAt.toISOString(),
      };
    }

    // Full Details View for Owner / Admin / Agreement Driver:
    const orderStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, orderId))
      .orderBy(asc(stops.seq));

    const orderInvoices = await this.dbService.db
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, orderId));

    const [customerUser] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, order.customerId))
      .limit(1);

    const hasActiveAgreement = agreement && agreement.status === 'active';
    const canSeeFullPhone = isOwner || isAdmin || (isAgreementDriver && hasActiveAgreement);
    const custLoc = normalizePoint(order.customerLocation);

    // Fetch media with short-lived presigned download URLs if authorized
    const mediaList = await this.dbService.db
      .select()
      .from(orderMedia)
      .where(eq(orderMedia.orderId, orderId));

    const privateBucket = process.env.STORAGE_PRIVATE_BUCKET || 'wasel-identity-private';
    const mediaWithUrls = await Promise.all(
      mediaList.map(async (m) => {
        let downloadUrl = '';
        try {
          downloadUrl = await this.storageService.getPresignedDownloadUrl(privateBucket, m.storageKey, 3600);
        } catch {
          // ignore error
        }
        return {
          id: m.id,
          stopId: m.stopId,
          uploaderId: m.uploaderId,
          mediaType: m.mediaType,
          storageKey: m.storageKey,
          downloadUrl,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    );

    return {
      id: order.id,
      regionId: order.regionId,
      customerId: order.customerId,
      customerName: customerUser?.fullName || 'العميل',
      customerPhoneMasked: maskPhone(customerUser?.phone),
      customerPhone: canSeeFullPhone ? customerUser?.phone : undefined,
      status: order.status,
      valueTierId: order.valueTierId,
      loadSizeId: order.loadSizeId,
      waitMode: order.waitMode,
      customerLocation: {
        latitude: custLoc.lat,
        longitude: custLoc.lng,
        lat: custLoc.lat,
        lng: custLoc.lng,
      },
      minFareMinor: order.minFareMinor,
      pricingSnapshot: order.pricingSnapshot,
      publishedAt: order.publishedAt?.toISOString() || null,
      expiresAt: order.expiresAt?.toISOString() || null,
      stops: orderStops.map((s) => {
        const stopLoc = normalizePoint(s.location);
        return {
          id: s.id,
          seq: s.seq,
          actionId: s.actionId,
          placeId: s.placeId,
          location: {
            latitude: stopLoc.lat,
            longitude: stopLoc.lng,
            lat: stopLoc.lat,
            lng: stopLoc.lng,
          },
          description: s.description,
          notes: s.notes,
          expectedDurationMinutes: s.expectedDurationMinutes,
          invoiceRequired: s.invoiceRequired,
          status: s.status,
        };
      }),
      agreement: agreement || null,
      invoices: orderInvoices,
      media: mediaWithUrls,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async getMediaUploadUrl(
    orderId: string,
    userId: string,
    dto: OrderUploadUrlRequestDto,
    rolesList: string[] = [],
  ) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, orderId))
      .limit(1);

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isOwner = order.customerId === userId;
    const isAgreementDriver = agreement?.driverId === userId && agreement.status === 'active';

    if (!isAdmin && !isOwner && !isAgreementDriver) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بإرفاق وسائط لهذا الطلب',
      });
    }

    // Enforce media count limit per order
    const maxMediaCount = await this.settingsService.getOrderMediaMaxCount(order.regionId);
    const [existingCount] = await this.dbService.db
      .select({ count: sql`count(*)` })
      .from(orderMedia)
      .where(eq(orderMedia.orderId, orderId));

    if (Number((existingCount as any)?.count || 0) >= maxMediaCount) {
      throw new BadRequestException({
        errorCode: ErrorCode.ORDER_MEDIA_LIMIT_EXCEEDED,
        message: `تم تجاوز الحد الأقصى للملفات المرفقة بالطلب (${maxMediaCount})`,
      });
    }

    const EXTENSION_MAP: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
    };

    const ext = EXTENSION_MAP[dto.mediaType] || 'jpg';
    const bucket = process.env.STORAGE_PRIVATE_BUCKET || 'wasel-identity-private';
    const fileKey = `orders/${orderId}/${crypto.randomUUID()}.${ext}`;

    const res = await this.storageService.getPresignedUploadUrl(bucket, fileKey, dto.mediaType, 900);

    const [createdMedia] = await this.dbService.db
      .insert(orderMedia)
      .values({
        orderId,
        stopId: dto.stopId || null,
        uploaderId: userId,
        mediaType: dto.mediaType,
        storageKey: res.fileKey,
      })
      .returning();

    return {
      id: createdMedia?.id,
      mediaId: createdMedia?.id,
      uploadUrl: res.uploadUrl,
      storageKey: res.fileKey,
      expiresInSeconds: res.expiresInSeconds,
    };
  }

  async getMediaDownloadUrl(
    orderId: string,
    mediaId: string,
    userId: string,
    rolesList: string[] = [],
  ) {
    const [media] = await this.dbService.db
      .select()
      .from(orderMedia)
      .where(and(eq(orderMedia.id, mediaId), eq(orderMedia.orderId, orderId)))
      .limit(1);

    if (!media) {
      throw new NotFoundException('الملف المرفق غير موجود');
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, orderId))
      .limit(1);

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isOwner = order?.customerId === userId;
    const isAgreementDriver = agreement?.driverId === userId;

    if (!isAdmin && !isOwner && !isAgreementDriver) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بتحميل هذا الملف',
      });
    }

    const bucket = process.env.STORAGE_PRIVATE_BUCKET || 'wasel-identity-private';
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(bucket, media.storageKey, 3600);

    return {
      id: media.id,
      downloadUrl,
      expiresInSeconds: 3600,
    };
  }

  private async getOwnedDraftOrder(orderId: string, customerId: string) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (order.customerId !== customerId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بتعديل هذا الطلب',
      });
    }

    if (order.status !== 'draft') {
      throw new ConflictException({
        errorCode: ErrorCode.ILLEGAL_TRANSITION,
        message: 'لا يمكن تعديل طلب تم نشره بالفعل أو إغلاقه',
      });
    }

    return order;
  }
}
