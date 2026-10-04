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
  pricingRules,
  valueTiers,
  vehicleTypes,
  loadSizeVehicleTypes,
  settings,
  customerProfiles,
  users,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { S3StorageService } from '../../common/storage/s3-storage.service.js';
import { maskPhone } from '../../common/utils/masking.js';
import {
  CreateOrderDto,
  UpdateOrderDto,
  CreateOrderStopDto,
  CancelOrderDto,
  OrderListQueryDto,
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
  ) {}

  async createDraftOrder(customerId: string, dto: CreateOrderDto) {
    // 1. Enforce max tasks per order setting
    const [maxTasksSetting] = await this.dbService.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'max_tasks_per_order'))
      .limit(1);

    const maxTasks = Number((maxTasksSetting?.value as any)?.value || maxTasksSetting?.value || 8);
    if (dto.stops.length > maxTasks) {
      throw new BadRequestException({
        errorCode: ErrorCode.MAX_STOPS_EXCEEDED,
        message: `لا يمكن أن تحتوي الطلبية على أكثر من ${maxTasks} مهام`,
        details: { maxAllowed: maxTasks, received: dto.stops.length },
      });
    }

    // 2. Resolve region
    let regionId = dto.regionId;
    if (!regionId) {
      const [user] = await this.dbService.db
        .select({ regionId: users.regionId })
        .from(users)
        .where(eq(users.id, customerId))
        .limit(1);
      regionId = user?.regionId || undefined;
    }

    if (!regionId) {
      const [defaultRegion] = await this.dbService.db
        .select({ id: users.regionId })
        .from(users)
        .limit(1);
      regionId = defaultRegion?.id || undefined;
    }

    // Ensure customer profile exists
    const [custProfile] = await this.dbService.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.id, customerId))
      .limit(1);

    if (!custProfile) {
      await this.dbService.db.insert(customerProfiles).values({ id: customerId, regionId });
    }

    const customerLocStr = `${dto.customerLocation.latitude},${dto.customerLocation.longitude}`;

    // 3. Insert order
    const [newOrder] = await this.dbService.db
      .insert(orders)
      .values({
        regionId: regionId!,
        customerId,
        status: 'draft',
        valueTierId: dto.valueTierId,
        loadSizeId: dto.loadSizeId,
        waitMode: dto.waitMode || 'wait',
        customerLocation: customerLocStr,
        minFareMinor: 0,
      })
      .returning();

    // 4. Insert stops sequentially
    for (let i = 0; i < dto.stops.length; i++) {
      const s = dto.stops[i]!;
      const stopLocStr = `${s.location.latitude},${s.location.longitude}`;
      await this.dbService.db.insert(stops).values({
        orderId: newOrder!.id,
        seq: s.seq || i + 1,
        actionId: s.actionId,
        placeId: s.placeId,
        location: stopLocStr,
        description: s.description,
        contactPhone: s.contactPhone,
        notes: s.notes,
        expectedDurationMinutes: s.expectedDurationMinutes || 0,
        invoiceRequired: s.invoiceRequired || false,
        status: 'pending',
      });
    }

    // 5. Emit event via outbox
    await this.eventBus.publish('order.created', newOrder!.id, {
      orderId: newOrder!.id,
      customerId,
      stopsCount: dto.stops.length,
    });

    return this.getOrderDetails(newOrder!.id, customerId, [UserRole.CUSTOMER]);
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
    const stopLocStr = `${dto.location.latitude},${dto.location.longitude}`;

    const [newStop] = await this.dbService.db
      .insert(stops)
      .values({
        orderId: order.id,
        seq: nextSeq,
        actionId: dto.actionId,
        placeId: dto.placeId,
        location: stopLocStr,
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

  async quoteOrder(orderId: string, _userId?: string) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
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
    const quote = await this.quoteOrder(orderId, customerId);

    const publishedAt = new Date();
    // 45 minutes order expiry default from settings or 30m
    const expiresAt = new Date(publishedAt.getTime() + 45 * 60 * 1000);

    const pricingSnapshot = {
      frozenAt: publishedAt.toISOString(),
      minFareMinor: quote.minFareMinor,
      billableVisits: quote.billableVisits,
      expectedWaitHours: quote.expectedWaitHours,
      breakdown: quote.breakdown,
    };

    // Update order status (triggers guard_status_transition)
    const [published] = await this.dbService.db
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

    // Transactional outbox event
    await this.eventBus.publish('order.published', published!.id, {
      orderId: published!.id,
      customerId,
      regionId: published!.regionId,
      minFareMinor: quote.minFareMinor,
      suggestedVehicles: quote.suggestedVehicleClasses,
      expiresAt: expiresAt.toISOString(),
    });

    return this.getOrderDetails(published!.id, customerId, [UserRole.CUSTOMER]);
  }

  async cancelOrder(orderId: string, userId: string, dto: CancelOrderDto, rolesList: string[]) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    if (!isAdmin && order.customerId !== userId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بإلغاء هذا الطلب',
      });
    }

    const [cancelled] = await this.dbService.db
      .update(orders)
      .set({
        status: 'cancelled',
        cancelledBy: userId,
        cancelReason: dto.reason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    await this.eventBus.publish('order.cancelled', orderId, {
      orderId,
      cancelledBy: userId,
      reason: dto.reason,
    });

    return cancelled;
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
    const isCustomer = order.customerId === userId;
    const isDriver = agreement?.driverId === userId;

    if (!isAdmin && !isCustomer && !isDriver) {
      // Driver radar view only if order is published/matching
      if (order.status !== 'published' && order.status !== 'matching' && order.status !== 'offers_received') {
        throw new ForbiddenException({
          errorCode: ErrorCode.OWNERSHIP_VIOLATION,
          message: 'غير مصرح لك باستعراض تفاصيل هذه الطلبية',
        });
      }
    }

    const orderStops = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.orderId, orderId))
      .orderBy(asc(stops.seq));

    const orderInvoices = await this.dbService.db
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, orderId));

    // Privacy rule: Only unmask customer phone if an active agreement exists with the driver
    const [customerUser] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, order.customerId))
      .limit(1);

    const hasActiveAgreement = agreement && agreement.status === 'active';
    const canSeeFullPhone = isCustomer || isAdmin || (isDriver && hasActiveAgreement);

    let customerLat = 29.975;
    let customerLng = 31.115;
    if (typeof order.customerLocation === 'string' && order.customerLocation.includes(',')) {
      const parts = order.customerLocation.split(',');
      customerLat = parseFloat(parts[0] || '29.975');
      customerLng = parseFloat(parts[1] || '31.115');
    }

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
      customerLocation: { latitude: customerLat, longitude: customerLng },
      minFareMinor: order.minFareMinor,
      pricingSnapshot: order.pricingSnapshot,
      publishedAt: order.publishedAt?.toISOString() || null,
      expiresAt: order.expiresAt?.toISOString() || null,
      stops: orderStops.map((s) => {
        let sLat = 29.975;
        let sLng = 31.115;
        if (typeof s.location === 'string' && s.location.includes(',')) {
          const parts = s.location.split(',');
          sLat = parseFloat(parts[0] || '29.975');
          sLng = parseFloat(parts[1] || '31.115');
        }
        return {
          id: s.id,
          seq: s.seq,
          actionId: s.actionId,
          placeId: s.placeId,
          location: { latitude: sLat, longitude: sLng },
          description: s.description,
          notes: s.notes,
          expectedDurationMinutes: s.expectedDurationMinutes,
          invoiceRequired: s.invoiceRequired,
          status: s.status,
        };
      }),
      agreement: agreement || null,
      invoices: orderInvoices,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async getMediaUploadUrl(orderId: string, userId: string, mediaType: string, stopId?: string) {
    const bucket = process.env.STORAGE_PUBLIC_BUCKET || 'wasel-public';
    const ext = mediaType.split('/')[1] || 'jpg';
    const fileKey = `orders/${orderId}/${crypto.randomUUID()}.${ext}`;

    const res = await this.storageService.getPresignedUploadUrl(bucket, fileKey, mediaType, 900);

    // Insert orderMedia record
    await this.dbService.db.insert(orderMedia).values({
      orderId,
      stopId,
      uploaderId: userId,
      mediaType,
      storageKey: res.fileKey,
    });

    return {
      uploadUrl: res.uploadUrl,
      storageKey: res.fileKey,
      expiresInSeconds: res.expiresInSeconds,
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
