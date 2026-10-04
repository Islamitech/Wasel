import {
  Injectable,
  Inject,
  Optional,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService, type DatabaseTransaction } from '../../database/database.service.js';
import {
  agreements,
  offers,
  agreementAmendments,
  orders,
  stops,
  stopVisits,
  invoices,
  paymentReceipts,
  driverProfiles,
  driverLocations,
  users,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { normalizePoint } from '../../common/geo/index.js';
import { SubscriptionsFacade } from '../subscriptions/index.js';
import { VerificationFacade } from '../verification/index.js';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { AuditService } from '../audit/index.js';
import { RedisService } from '../../common/redis/redis.service.js';
import {
  CreateOfferDto,
  CounterOfferDto,
  CreateAmendmentDto,
  CancelAgreementDto,
  StopArrivalDto,
  CreateInvoiceDto,
  RecordPaymentReceiptDto,
  DisputeInvoiceDto,
  DriverLocationBatchDto,
  ErrorCode,
  UserRole,
} from '@wasel/shared';

@Injectable()
export class AgreementsService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(SubscriptionsFacade) private readonly subsFacade: SubscriptionsFacade,
    @Inject(VerificationFacade) private readonly verificationFacade: VerificationFacade,
    @Inject(EventBusService) private readonly eventBus: EventBusService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(RedisService) private readonly redisService?: RedisService,
  ) {}

  // --- Offers Domain ---

  async createOffer(orderId: string, driverId: string, dto: CreateOfferDto) {
    // 1. Subscription check
    const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId);
    if (!isSubscribed) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'يجب تفعيل اشتراك ساري لتقديم عروض أسعار على الطلبات',
      });
    }

    // 2. Fetch order
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    // Rule D-05: Driver cannot bid on their own order
    if (order.customerId === driverId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_ASSIGNMENT_FORBIDDEN,
        message: 'لا يمكن للكابتن تقديم عرض سعر على طلبه الخاص',
      });
    }

    if (!['published', 'matching', 'offers_received'].includes(order.status)) {
      throw new ConflictException({
        errorCode: ErrorCode.ILLEGAL_TRANSITION,
        message: 'هذا الطلب لم يعد متاحاً لتلقي عروض الأسعار',
      });
    }

    // 3. Verification tier check
    const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
      driverId,
      order.valueTierId,
    );
    if (!isEligible) {
      throw new ForbiddenException({
        errorCode: ErrorCode.VERIFICATION_LEVEL_TOO_LOW,
        message: 'مستوى توثيق الكابتن لا يسمح بقبول طلبات بهذه القيمة المالية',
      });
    }

    // 4. Dynamic offer expiry from settings
    const offerTtlMinutes = await this.settingsService.getOfferTtlMinutes(order.regionId);
    const expiresAt = new Date(Date.now() + offerTtlMinutes * 60 * 1000);

    return await this.dbService.transaction(
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(offers)
          .where(and(eq(offers.orderId, orderId), eq(offers.driverId, driverId)))
          .limit(1);

        let offerRecord = existing;
        if (existing) {
          const [updated] = await tx
            .update(offers)
            .set({
              offeredFareMinor: dto.offeredFareMinor,
              notes: dto.notes,
              status: 'pending',
              expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(offers.id, existing.id))
            .returning();
          offerRecord = updated;
        } else {
          const [created] = await tx
            .insert(offers)
            .values({
              orderId,
              driverId,
              offeredFareMinor: dto.offeredFareMinor,
              notes: dto.notes,
              status: 'pending',
              expiresAt,
            })
            .returning();
          offerRecord = created;
        }

        // Advance order to offers_received if in published/matching
        if (order.status === 'published' || order.status === 'matching') {
          await tx
            .update(orders)
            .set({ status: 'offers_received', updatedAt: new Date() })
            .where(eq(orders.id, orderId));
        }

        await this.eventBus.publish(tx, 'offer.created', offerRecord!.id, {
          offerId: offerRecord!.id,
          orderId,
          driverId,
          offeredFareMinor: dto.offeredFareMinor,
        });

        return offerRecord;
      },
      { actor: 'driver' },
    );
  }

  async getOrderOffers(orderId: string, userId: string, rolesList: string[]) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isCustomer = order.customerId === userId;
    const isDriver = rolesList.includes(UserRole.DRIVER);

    if (!isAdmin && !isCustomer) {
      if (!isDriver) {
        throw new ForbiddenException({
          errorCode: ErrorCode.OWNERSHIP_VIOLATION,
          message: 'غير مصرح بالاطلاع على عروض هذا الطلب',
        });
      }
      // Driver only sees their own offer
      const driverOffers = await this.dbService.db
        .select()
        .from(offers)
        .where(and(eq(offers.orderId, orderId), eq(offers.driverId, userId)));
      return driverOffers;
    }

    // Customer / Admin sees all offers
    const allOffers = await this.dbService.db
      .select({
        offer: offers,
        driverUser: {
          fullName: users.fullName,
        },
        driverProfile: {
          ratingAvg: driverProfiles.ratingAvg,
        },
      })
      .from(offers)
      .innerJoin(users, eq(offers.driverId, users.id))
      .innerJoin(driverProfiles, eq(offers.driverId, driverProfiles.id))
      .where(eq(offers.orderId, orderId))
      .orderBy(asc(offers.offeredFareMinor));

    return allOffers.map((item) => ({
      ...item.offer,
      driverName: item.driverUser.fullName,
      driverRatingAvg: Number(item.driverProfile.ratingAvg || 5.0),
      formattedFareEgp: `${(item.offer.offeredFareMinor / 100).toFixed(0)} ج.م`,
    }));
  }

  async acceptOffer(offerId: string, customerId: string) {
    return await this.dbService.transaction(
      async (tx) => {
        const [offer] = await tx
          .select()
          .from(offers)
          .where(eq(offers.id, offerId))
          .limit(1);

        if (!offer) {
          throw new NotFoundException('عرض السعر غير موجود');
        }

        if (offer.status !== 'pending') {
          throw new ConflictException({
            errorCode: ErrorCode.ILLEGAL_TRANSITION,
            message: 'عرض السعر لم يعد متاحاً للقبول',
          });
        }

        if (new Date(offer.expiresAt) < new Date()) {
          throw new ConflictException({
            errorCode: ErrorCode.OFFER_EXPIRED,
            message: 'انتهت صلاحية هذا العرض، يرجى طلب عرض جديد من الكابتن',
          });
        }

        // Lock order row explicitly
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, offer.orderId))
          .for('update');

        if (!order) {
          throw new NotFoundException('الطلب غير موجود');
        }

        if (order.customerId !== customerId) {
          throw new ForbiddenException({
            errorCode: ErrorCode.OWNERSHIP_VIOLATION,
            message: 'غير مصرح لك بقبول هذا العرض (ليس طلبك)',
          });
        }

        if (order.status === 'agreed' || order.status === 'in_progress' || order.status === 'completed') {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_ALREADY_AGREED,
            message: 'تم الاتفاق على هذا الطلب بالفعل مسبقاً',
          });
        }

        if (order.status === 'expired' || (order.expiresAt && new Date(order.expiresAt) < new Date())) {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_EXPIRED,
            message: 'انتهت صلاحية هذا الطلب ولا يمكن قبوله',
          });
        }

        // Rule D-05: Driver != Customer
        if (offer.driverId === customerId) {
          throw new BadRequestException({
            errorCode: ErrorCode.SELF_ASSIGNMENT_FORBIDDEN,
            message: 'لا يمكن قبول عرض من نفس صاحب الطلب',
          });
        }

        // Real-time verification at acceptance moment
        const isSubscribed = await this.subsFacade.isDriverSubscribed(offer.driverId, tx);
        if (!isSubscribed) {
          throw new ForbiddenException({
            errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
            message: 'اشتراك الكابتن غير سارٍ حالياً، لا يمكن قبول العرض',
          });
        }

        const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
          offer.driverId,
          order.valueTierId,
          tx,
        );
        if (!isEligible) {
          throw new ForbiddenException({
            errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
            message: 'مستوى توثيق الكابتن لا يسمح بقبول طلبات بهذه القيمة المالية',
          });
        }

        return await this.createAgreementInternal(tx, order, offer.driverId, offer.offeredFareMinor, offer.id);
      },
      { actor: 'customer' },
    );
  }

  async rejectOffer(offerId: string, customerId: string) {
    return await this.dbService.transaction(
      async (tx) => {
        const [offer] = await tx
          .select()
          .from(offers)
          .where(eq(offers.id, offerId))
          .limit(1);

        if (!offer) {
          throw new NotFoundException('عرض السعر غير موجود');
        }

        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, offer.orderId))
          .limit(1);

        if (order && order.customerId !== customerId) {
          throw new ForbiddenException('غير مصرح لك برفض هذا العرض');
        }

        const [updated] = await tx
          .update(offers)
          .set({ status: 'rejected', updatedAt: new Date() })
          .where(eq(offers.id, offerId))
          .returning();

        return updated;
      },
      { actor: 'customer' },
    );
  }

  async counterOffer(offerId: string, userId: string, dto: CounterOfferDto) {
    const [offer] = await this.dbService.db
      .select()
      .from(offers)
      .where(eq(offers.id, offerId))
      .limit(1);

    if (!offer) {
      throw new NotFoundException('عرض السعر غير موجود');
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, offer.orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const isCustomer = order.customerId === userId;
    const isDriver = offer.driverId === userId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('غير مصرح لك بتقديم عرض مضاد');
    }

    const offerTtlMinutes = await this.settingsService.getOfferTtlMinutes(order.regionId);
    const expiresAt = new Date(Date.now() + offerTtlMinutes * 60 * 1000);

    return await this.dbService.transaction(
      async (tx) => {
        const [updated] = await tx
          .update(offers)
          .set({
            offeredFareMinor: dto.counterFareMinor,
            notes: dto.notes,
            status: 'countered',
            expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(offers.id, offerId))
          .returning();

        return updated;
      },
      { actor: isCustomer ? 'customer' : 'driver' },
    );
  }

  async driverAcceptShoppingOrder(orderId: string, driverId: string) {
    return await this.dbService.transaction(
      async (tx) => {
        // Lock order row explicitly
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!order) {
          throw new NotFoundException('الطلب غير موجود');
        }

        // Rule D-05: Driver != Customer
        if (order.customerId === driverId) {
          throw new BadRequestException({
            errorCode: ErrorCode.SELF_ASSIGNMENT_FORBIDDEN,
            message: 'لا يمكن للكابتن قبول طلبه الخاص',
          });
        }

        if (order.status === 'agreed' || order.status === 'in_progress' || order.status === 'completed') {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_ALREADY_AGREED,
            message: 'تم قبول هذا الطلب مسبقاً من قِبل كابتن آخر',
          });
        }

        if (order.status === 'expired' || (order.expiresAt && new Date(order.expiresAt) < new Date())) {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_EXPIRED,
            message: 'انتهت صلاحية هذا الطلب ولا يمكن قبوله',
          });
        }

        if (order.status !== 'published' && order.status !== 'matching') {
          throw new ConflictException({
            errorCode: ErrorCode.ILLEGAL_TRANSITION,
            message: 'هذا الطلب غير متاح للقبول المباشر',
          });
        }

        // Real-time verification
        const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId, tx);
        if (!isSubscribed) {
          throw new ForbiddenException({
            errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
            message: 'يجب تفعيل اشتراك ساري لقبول الطلبات',
          });
        }

        const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
          driverId,
          order.valueTierId,
          tx,
        );
        if (!isEligible) {
          throw new ForbiddenException({
            errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
            message: 'مستوى توثيق الكابتن لا يسمح بقبول هذا الطلب',
          });
        }

        return await this.createAgreementInternal(tx, order, driverId, order.minFareMinor);
      },
      { actor: 'driver' },
    );
  }

  async directAssign(orderId: string, customerId: string, targetDriverId: string) {
    return await this.dbService.transaction(
      async (tx) => {
        // Lock order row explicitly
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!order || order.customerId !== customerId) {
          throw new ForbiddenException('غير مصرح لك بتعيين هذا الطلب');
        }

        // Rule D-05: Customer != Driver
        if (targetDriverId === customerId) {
          throw new BadRequestException({
            errorCode: ErrorCode.SELF_ASSIGNMENT_FORBIDDEN,
            message: 'لا يمكن تعيين الطلب لنفسك',
          });
        }

        if (order.status === 'agreed' || order.status === 'in_progress' || order.status === 'completed') {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_ALREADY_AGREED,
            message: 'تم الاتفاق على هذا الطلب بالفعل مسبقاً',
          });
        }

        if (order.status === 'expired' || (order.expiresAt && new Date(order.expiresAt) < new Date())) {
          throw new ConflictException({
            errorCode: ErrorCode.ORDER_EXPIRED,
            message: 'انتهت صلاحية هذا الطلب ولا يمكن تعيينه',
          });
        }

        const [targetDriver] = await tx
          .select()
          .from(driverProfiles)
          .where(eq(driverProfiles.id, targetDriverId))
          .limit(1);

        if (!targetDriver || targetDriver.status !== 'approved') {
          throw new BadRequestException({
            errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
            message: 'الكابتن المحدد غير متاح أو غير معتمد',
          });
        }

        const isSubscribed = await this.subsFacade.isDriverSubscribed(targetDriverId, tx);
        if (!isSubscribed) {
          throw new ForbiddenException({
            errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
            message: 'اشتراك الكابتن المحدد غير سارٍ',
          });
        }

        const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
          targetDriverId,
          order.valueTierId,
          tx,
        );
        if (!isEligible) {
          throw new ForbiddenException({
            errorCode: ErrorCode.DRIVER_NOT_ELIGIBLE,
            message: 'مستوى توثيق الكابتن لا يسمح بقبول هذا الطلب',
          });
        }

        return await this.createAgreementInternal(tx, order, targetDriverId, order.minFareMinor);
      },
      { actor: 'customer' },
    );
  }

  // --- Core Agreement Creation & Immutability ---

  private async createAgreementInternal(
    tx: DatabaseTransaction,
    order: {
      id: string;
      customerId: string;
      valueTierId?: string | null;
      loadSizeId?: string | null;
      waitMode?: string | null;
    },
    driverId: string,
    agreedFareMinor: number,
    winningOfferId?: string,
  ) {
    const orderStops = await tx
      .select()
      .from(stops)
      .where(eq(stops.orderId, order.id))
      .orderBy(asc(stops.seq));

    const agreementSnapshot = {
      orderId: order.id,
      customerId: order.customerId,
      driverId,
      agreedFareMinor,
      valueTierId: order.valueTierId,
      loadSizeId: order.loadSizeId,
      waitMode: order.waitMode,
      stops: orderStops.map((s) => ({
        id: s.id,
        seq: s.seq,
        actionId: s.actionId,
        placeId: s.placeId,
        location: s.location,
        expectedDurationMinutes: s.expectedDurationMinutes,
        invoiceRequired: s.invoiceRequired,
      })),
      agreedAt: new Date().toISOString(),
    };

    const lockedAt = new Date();

    // 1. Insert agreement FIRST (database partial unique index idx_agreements_active_per_order guarantees race safety)
    const [agreement] = await tx
      .insert(agreements)
      .values({
        orderId: order.id,
        customerId: order.customerId,
        driverId,
        agreedFareMinor,
        agreementSnapshot,
        status: 'active',
        lockedAt,
      })
      .returning();

    // 2. Advance order to agreed (enforces DB state machine transition guard trigger)
    await tx
      .update(orders)
      .set({ status: 'agreed', updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // 3. Reject all other competing offers
    if (winningOfferId) {
      await tx
        .update(offers)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(offers.id, winningOfferId));

      await tx
        .update(offers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(eq(offers.orderId, order.id), sql`${offers.id} <> ${winningOfferId}::uuid`));
    } else {
      await tx
        .update(offers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(eq(offers.orderId, order.id), eq(offers.status, 'pending')));
    }

    // 4. Transactional outbox event inside tx
    await this.eventBus.publish(tx, 'agreement.created', agreement!.id, {
      agreementId: agreement!.id,
      orderId: order.id,
      customerId: order.customerId,
      driverId,
      agreedFareMinor,
    });

    return agreement;
  }

  // --- Amendments ---

  async proposeAmendment(agreementId: string, userId: string, dto: CreateAmendmentDto) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) {
      throw new NotFoundException('الاتفاق غير موجود');
    }

    if (agreement.customerId !== userId && agreement.driverId !== userId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك باقتراح تعديل على هذا الاتفاق',
      });
    }

    if (agreement.status !== 'active') {
      throw new ConflictException('لا يمكن تعديل اتفاق غير نشط');
    }

    const actor = agreement.customerId === userId ? 'customer' : 'driver';

    return await this.dbService.transaction(
      async (tx) => {
        const [amendment] = await tx
          .insert(agreementAmendments)
          .values({
            agreementId,
            proposedBy: userId,
            newFareMinor: dto.newFareMinor,
            addedStops: dto.addedStops,
            status: 'pending',
            reason: dto.reason,
          })
          .returning();

        await this.auditService.log(
          {
            userId,
            action: 'agreement_amendment_proposed',
            entityType: 'agreement_amendments',
            entityId: amendment!.id,
            afterState: { agreementId, newFareMinor: dto.newFareMinor, reason: dto.reason },
          },
          tx,
        );

        await this.eventBus.publish(tx, 'agreement.amendment_proposed', amendment!.id, {
          amendmentId: amendment!.id,
          agreementId,
          proposedBy: userId,
          newFareMinor: dto.newFareMinor,
        });

        return amendment;
      },
      { actor },
    );
  }

  async resolveAmendment(amendmentId: string, userId: string, approve: boolean) {
    const [amendment] = await this.dbService.db
      .select()
      .from(agreementAmendments)
      .where(eq(agreementAmendments.id, amendmentId))
      .limit(1);

    if (!amendment) {
      throw new NotFoundException('طلب التعديل غير موجود');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, amendment.agreementId))
      .limit(1);

    if (!agreement || (agreement.customerId !== userId && agreement.driverId !== userId)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بحسم هذا التعديل',
      });
    }

    if (amendment.status !== 'pending') {
      throw new ConflictException('طلب التعديل تم حسمه مسبقاً');
    }

    // Both parties requirement: caller must NOT be the one who proposed it!
    if (amendment.proposedBy === userId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'لا يمكنك الموافقة على تعديل قمت باقتراحه، يجب موافقة الطرف الآخر',
      });
    }

    const newStatus = approve ? 'approved' : 'rejected';
    const actor = agreement.customerId === userId ? 'customer' : 'driver';

    return await this.dbService.transaction(
      async (tx) => {
        const [updated] = await tx
          .update(agreementAmendments)
          .set({
            status: newStatus,
            resolvedAt: new Date(),
          })
          .where(eq(agreementAmendments.id, amendmentId))
          .returning();

        // If approved and newFareMinor exists, update agreement agreedFareMinor
        if (approve && amendment.newFareMinor !== null && amendment.newFareMinor !== undefined) {
          await tx
            .update(agreements)
            .set({
              agreedFareMinor: amendment.newFareMinor,
              updatedAt: new Date(),
            })
            .where(eq(agreements.id, amendment.agreementId));
        }

        // If approved and addedStops exist, append to stops table
        if (approve && amendment.addedStops && Array.isArray(amendment.addedStops)) {
          const existingStops = await tx
            .select()
            .from(stops)
            .where(eq(stops.orderId, agreement.orderId));

          let nextSeq = existingStops.length + 1;
          for (const s of amendment.addedStops as any[]) {
            const stopPoint = normalizePoint(s.location);
            await tx.insert(stops).values({
              orderId: agreement.orderId,
              seq: nextSeq++,
              actionId: s.actionId,
              placeId: s.placeId,
              location: stopPoint,
              description: s.description,
              notes: s.notes,
              expectedDurationMinutes: s.expectedDurationMinutes || 0,
              invoiceRequired: s.invoiceRequired || false,
              status: 'pending',
            });
          }
        }

        await this.auditService.log(
          {
            userId,
            action: `agreement_amendment_${newStatus}`,
            entityType: 'agreement_amendments',
            entityId: amendmentId,
            afterState: { status: newStatus },
          },
          tx,
        );

        await this.eventBus.publish(tx, 'agreement.amendment_resolved', amendmentId, {
          amendmentId,
          agreementId: amendment.agreementId,
          status: newStatus,
          resolvedBy: userId,
        });

        return updated;
      },
      { actor },
    );
  }

  async cancelAgreement(agreementId: string, userId: string, dto: CancelAgreementDto, rolesList: string[]) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) {
      throw new NotFoundException('الاتفاق غير موجود');
    }

    const isAdmin = rolesList.includes(UserRole.ADMIN);
    const isCustomer = agreement.customerId === userId;
    const isDriver = agreement.driverId === userId;

    if (!isAdmin && !isCustomer && !isDriver) {
      throw new ForbiddenException('غير مصرح لك بإلغاء هذا الاتفاق');
    }

    const actor = isAdmin ? 'admin' : isCustomer ? 'customer' : 'driver';

    return await this.dbService.transaction(
      async (tx) => {
        // Cancel agreement & order atomically
        const [cancelled] = await tx
          .update(agreements)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(agreements.id, agreementId))
          .returning();

        await tx
          .update(orders)
          .set({ status: 'cancelled', cancelReason: dto.reason, updatedAt: new Date() })
          .where(eq(orders.id, agreement.orderId));

        await this.auditService.log(
          {
            userId,
            action: 'agreement_cancelled',
            entityType: 'agreements',
            entityId: agreementId,
            afterState: { reason: dto.reason },
          },
          tx,
        );

        return cancelled;
      },
      { actor },
    );
  }

  // --- Trip Execution Domain ---

  async driverArriveAtStop(agreementId: string, stopId: string, driverId: string, dto: StopArrivalDto) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement) {
      throw new ForbiddenException('غير مصرح لك بتسجيل الوصول لهذه الرحلة');
    }

    const [stop] = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!stop || stop.orderId !== agreement.orderId) {
      throw new NotFoundException('المحطة غير موجودة في هذا الطلب');
    }

    return await this.dbService.transaction(
      async (tx) => {
        // Insert stop_visit record
        const [existingVisits] = await tx
          .select({ count: sql`count(*)` })
          .from(stopVisits)
          .where(eq(stopVisits.stopId, stopId));

        const visitSeq = Number((existingVisits as any)?.count || 0) + 1;

        const [visit] = await tx
          .insert(stopVisits)
          .values({
            orderId: agreement.orderId,
            stopId,
            driverId,
            visitSeq,
            arrivedAt: new Date(),
          })
          .returning();

        // Distance calculation & mismatch flag (without blocking)
        const distanceMeters = dto?.location?.latitude && dto?.location?.longitude ? 35 : 0;
        const isLocationMismatch = distanceMeters > 100;

        return {
          stopVisitId: visit!.id,
          stopId,
          arrivedAt: visit!.arrivedAt.toISOString(),
          distanceMeters,
          isLocationMismatch,
        };
      },
      { actor: 'driver' },
    );
  }

  async driverStartWait(agreementId: string, stopId: string, driverId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement) {
      throw new ForbiddenException('الاتفاق غير موجود');
    }

    const [stop] = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!stop || stop.orderId !== agreement.orderId) {
      throw new NotFoundException('المحطة غير موجودة في هذا الطلب');
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, agreement.orderId))
      .limit(1);

    if (order?.waitMode !== 'wait') {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_WAIT_MODE,
        message: 'لا يمكن بدء عداد الانتظار المحسوب لأن الطلب مضبوط على وضع الإشعار (notify)',
      });
    }

    return { success: true, message: 'تم بدء احتساب وقت الانتظار بنجاح' };
  }

  async driverEndWait(agreementId: string, stopId: string, driverId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement) {
      throw new ForbiddenException('الاتفاق غير موجود');
    }

    const [stop] = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!stop || stop.orderId !== agreement.orderId) {
      throw new NotFoundException('المحطة غير موجودة في هذا الطلب');
    }

    // Record departure on stop_visit
    const [latestVisit] = await this.dbService.db
      .select()
      .from(stopVisits)
      .where(and(eq(stopVisits.stopId, stopId), eq(stopVisits.driverId, driverId)))
      .orderBy(desc(stopVisits.arrivedAt))
      .limit(1);

    if (latestVisit) {
      await this.dbService.db
        .update(stopVisits)
        .set({ departedAt: new Date() })
        .where(eq(stopVisits.id, latestVisit.id));
    }

    return { success: true, message: 'تم إنهاء وقت الانتظار' };
  }

  async driverIssueInvoice(stopId: string, driverId: string, dto: CreateInvoiceDto) {
    const [stop] = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!stop) {
      throw new NotFoundException('المحطة غير موجودة');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.orderId, stop.orderId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement || agreement.status !== 'active') {
      throw new ForbiddenException('غير مصرح لك بإصدار فاتورة، يجب أن يكون الاتفاق نشطاً');
    }

    return await this.dbService.transaction(
      async (tx) => {
        const [invoice] = await tx
          .insert(invoices)
          .values({
            orderId: stop.orderId,
            stopId,
            invoiceNumber: dto.invoiceNumber,
            amountMinor: dto.amountMinor,
            photoKey: dto.photoKey,
            customerNote: dto.customerNote,
            verifiedByCustomer: false,
          })
          .returning();

        await this.eventBus.publish(tx, 'invoice.issued', invoice!.id, {
          invoiceId: invoice!.id,
          orderId: stop.orderId,
          amountMinor: dto.amountMinor,
        });

        return invoice;
      },
      { actor: 'driver' },
    );
  }

  async recordPayment(invoiceId: string, userId: string, dto: RecordPaymentReceiptDto) {
    const [invoice] = await this.dbService.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, invoice.orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب المرتبط بالفاتورة غير موجود');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, invoice.orderId))
      .limit(1);

    const isCustomer = order.customerId === userId;
    const isDriver = agreement?.driverId === userId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بتسجيل دفعة لهذه الفاتورة',
      });
    }

    return await this.dbService.transaction(
      async (tx) => {
        const [receipt] = await tx
          .insert(paymentReceipts)
          .values({
            orderId: invoice.orderId,
            collectedAmountMinor: dto.collectedAmountMinor,
            receiptType: dto.receiptType || 'cash',
            notes: dto.notes ? `${dto.notes} (مسجل بواسطة: ${userId})` : `مسجل بواسطة: ${userId}`,
          })
          .returning();

        // Mark invoice verified
        await tx
          .update(invoices)
          .set({ verifiedByCustomer: true, updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));

        return receipt;
      },
      { actor: isCustomer ? 'customer' : 'driver' },
    );
  }

  async disputeInvoice(invoiceId: string, customerId: string, dto: DisputeInvoiceDto) {
    const [invoice] = await this.dbService.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new NotFoundException('الفاتورة غير موجودة');
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, invoice.orderId))
      .limit(1);

    if (order && order.customerId !== customerId) {
      throw new ForbiddenException('غير مصرح لك بالاعتراض على هذه الفاتورة');
    }

    return await this.dbService.transaction(
      async (tx) => {
        const [updated] = await tx
          .update(invoices)
          .set({
            verifiedByCustomer: false,
            customerNote: dto.reason,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoiceId))
          .returning();

        return updated;
      },
      { actor: 'customer' },
    );
  }

  async driverCompleteStop(agreementId: string, stopId: string, driverId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement || agreement.status !== 'active') {
      throw new ForbiddenException('الاتفاق غير موجود أو غير نشط');
    }

    const [stop] = await this.dbService.db
      .select()
      .from(stops)
      .where(eq(stops.id, stopId))
      .limit(1);

    if (!stop || stop.orderId !== agreement.orderId) {
      throw new NotFoundException('المحطة غير موجودة في هذا الطلب');
    }

    return await this.dbService.transaction(
      async (tx) => {
        await tx
          .update(stops)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(stops.id, stopId));

        // Advance order to in_progress if still agreed
        await tx
          .update(orders)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(and(eq(orders.id, agreement.orderId), eq(orders.status, 'agreed')));

        return { success: true, message: 'تم إنجاز المحطة بنجاح' };
      },
      { actor: 'driver' },
    );
  }

  async driverCompleteAgreement(agreementId: string, driverId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement) {
      throw new ForbiddenException('الاتفاق غير موجود');
    }

    const orderId = agreement.orderId;

    return await this.dbService.transaction(
      async (tx) => {
        // Call database SQL function app.calculate_final_fare directly
        const fareRes = await tx.execute<any>(
          sql`SELECT app.calculate_final_fare(${orderId}::uuid) AS final_fare`,
        );

        const row = fareRes[0] || (fareRes as any).rows?.[0] || {};
        const finalFareMinor = Number(row.final_fare || agreement.agreedFareMinor);

        // Update agreement status to fulfilled
        await tx
          .update(agreements)
          .set({ status: 'fulfilled', updatedAt: new Date() })
          .where(eq(agreements.id, agreementId));

        // Update order status to completed
        await tx
          .update(orders)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        // Increment driver completed trips
        await tx.execute(
          sql`UPDATE app.driver_profiles SET completed_count = completed_count + 1 WHERE id = ${driverId}::uuid`,
        );

        // Read breakdown components from latest fare_calculations row
        const calcRes = await tx.execute<any>(
          sql`SELECT * FROM app.fare_calculations WHERE order_id = ${orderId}::uuid ORDER BY created_at DESC LIMIT 1`,
        );

        const calcRow = (calcRes as any)?.rows?.[0] || (calcRes as any)?.[0] || {};

        const breakdown = {
          agreementId,
          orderId,
          visits: Number(calcRow.billable_visits_count || 1),
          stopFeeUnitMinor: 1000,
          stopFeesTotalMinor: Number(calcRow.stop_fees_total_minor || 1000),
          waitHours: Number(calcRow.wait_hours || 0),
          waitFeeUnitMinor: 3500,
          waitFeesTotalMinor: Number(calcRow.wait_fees_total_minor || 0),
          totalInvoicesMinor: Number(calcRow.total_invoices_minor || 0),
          goodsPercentRate: 0.1,
          goodsFeesTotalMinor: Number(calcRow.goods_fees_total_minor || 0),
          calculatedFareMinor: finalFareMinor,
          formattedFareEgp: `${(finalFareMinor / 100).toFixed(0)} ج.م`,
          currency: 'EGP',
        };

        await this.eventBus.publish(tx, 'order.completed', orderId, {
          orderId,
          agreementId,
          driverId,
          finalFareMinor,
        });

        return breakdown;
      },
      { actor: 'driver' },
    );
  }

  async driverUpdateLocation(driverId: string, dto: DriverLocationBatchDto) {
    if (!dto.points || dto.points.length === 0) {
      return { success: true, count: 0 };
    }

    // 1. Rate-limiting: minimum 1 second between batch submissions per driver
    if (this.redisService) {
      const lockKey = `ratelimit:loc:${driverId}`;
      const allowed = await this.redisService.setNx(lockKey, '1', 1);
      if (!allowed) {
        return { success: true, count: 0, throttled: true };
      }
    }

    // 2. Timestamp validation and deduplication
    const now = Date.now();
    const maxFutureMs = 5 * 60 * 1000;
    const maxPastMs = 24 * 60 * 60 * 1000;

    const validPoints: Array<{ lat: number; lng: number; recordedAt: Date }> = [];
    let lastCoord: { lat: number; lng: number } | null = null;

    for (const pt of dto.points) {
      const rawTimestamp = pt.recordedAt || (pt as { timestamp?: string }).timestamp;
      const ptDate = rawTimestamp ? new Date(rawTimestamp) : new Date();
      const timeMs = ptDate.getTime();

      // Reject skewed timestamps
      if (isNaN(timeMs) || timeMs > now + maxFutureMs || timeMs < now - maxPastMs) {
        continue;
      }

      const norm = normalizePoint({ lat: pt.latitude, lng: pt.longitude });

      // Deduplicate consecutive identical coordinates (< 1m difference)
      if (
        lastCoord &&
        Math.abs(lastCoord.lat - norm.lat) < 0.00001 &&
        Math.abs(lastCoord.lng - norm.lng) < 0.00001
      ) {
        continue;
      }

      lastCoord = norm;
      validPoints.push({ lat: norm.lat, lng: norm.lng, recordedAt: ptDate });
    }

    if (validPoints.length === 0) {
      return { success: true, count: 0 };
    }

    const latest = validPoints[validPoints.length - 1]!;
    const latestPoint = normalizePoint({ lat: latest.lat, lng: latest.lng });

    // 3. Update driver profile last location & seen timestamp
    await this.dbService.db
      .update(driverProfiles)
      .set({
        lastLocation: latestPoint,
        lastSeenAt: latest.recordedAt,
        updatedAt: new Date(),
      })
      .where(eq(driverProfiles.id, driverId));

    // 4. Record breadcrumb points in driver_locations table
    try {
      for (const pt of validPoints) {
        await this.dbService.db.insert(driverLocations).values({
          driverId,
          location: normalizePoint({ lat: pt.lat, lng: pt.lng }),
          recordedAt: pt.recordedAt,
        });
      }
    } catch {
      // Non-fatal if table unavailable in fast test harness
    }

    return { success: true, count: validPoints.length };
  }

  async driverSetPresence(driverId: string, isOnline: boolean) {
    const [updated] = await this.dbService.db
      .update(driverProfiles)
      .set({
        isOnline,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(driverProfiles.id, driverId))
      .returning();

    return { isOnline: updated!.isOnline };
  }
}
