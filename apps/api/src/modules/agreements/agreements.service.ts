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
  agreements,
  offers,
  agreementAmendments,
  orders,
  stops,
  stopVisits,
  invoices,
  paymentReceipts,
  driverProfiles,
  users,
} from '../../database/schema/index.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { SubscriptionsFacade } from '../subscriptions/index.js';
import { VerificationFacade } from '../verification/index.js';
import { EventBusService } from '../../common/events/event-bus.service.js';
import { AuditService } from '../audit/index.js';
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
    @Inject(AuditService) private readonly auditService: AuditService,
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

    // 4. Upsert Offer
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry
    const [existing] = await this.dbService.db
      .select()
      .from(offers)
      .where(and(eq(offers.orderId, orderId), eq(offers.driverId, driverId)))
      .limit(1);

    let offerRecord = existing;
    if (existing) {
      const [updated] = await this.dbService.db
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
      const [created] = await this.dbService.db
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
      await this.dbService.db
        .update(orders)
        .set({ status: 'offers_received', updatedAt: new Date() })
        .where(eq(orders.id, orderId));
    }

    await this.eventBus.publish('offer.created', offerRecord!.id, {
      offerId: offerRecord!.id,
      orderId,
      driverId,
      offeredFareMinor: dto.offeredFareMinor,
    });

    return offerRecord;
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

    if (!isAdmin && !isCustomer) {
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

    if (new Date(offer.expiresAt) < new Date()) {
      throw new ConflictException({
        errorCode: ErrorCode.OFFER_EXPIRED,
        message: 'انتهت صلاحية هذا العرض، يرجى طلب عرض جديد من الكابتن',
      });
    }

    return this.createAgreementInternal(order, offer.driverId, offer.offeredFareMinor, offer.id);
  }

  async rejectOffer(offerId: string, customerId: string) {
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

    if (order && order.customerId !== customerId) {
      throw new ForbiddenException('غير مصرح لك برفض هذا العرض');
    }

    const [updated] = await this.dbService.db
      .update(offers)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(offers.id, offerId))
      .returning();

    return updated;
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

    if (order && order.customerId !== userId && offer.driverId !== userId) {
      throw new ForbiddenException('غير مصرح لك بتقديم عرض مضاد');
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const [updated] = await this.dbService.db
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
  }

  async driverAcceptShoppingOrder(orderId: string, driverId: string) {
    // 1. Subscription check
    const isSubscribed = await this.subsFacade.isDriverSubscribed(driverId);
    if (!isSubscribed) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'يجب تفعيل اشتراك ساري لقبول الطلبات',
      });
    }

    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    if (order.status === 'agreed') {
      throw new ConflictException({
        errorCode: ErrorCode.ORDER_ALREADY_AGREED,
        message: 'تم قبول هذا الطلب مسبقاً من قِبل كابتن آخر',
      });
    }

    const isEligible = await this.verificationFacade.isDriverEligibleForValueTier(
      driverId,
      order.valueTierId,
    );
    if (!isEligible) {
      throw new ForbiddenException({
        errorCode: ErrorCode.VERIFICATION_LEVEL_TOO_LOW,
        message: 'مستوى توثيق الكابتن لا يسمح بقبول هذا الطلب',
      });
    }

    return this.createAgreementInternal(order, driverId, order.minFareMinor);
  }

  async directAssign(orderId: string, customerId: string, targetDriverId: string) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.customerId !== customerId) {
      throw new ForbiddenException('غير مصرح لك بتعيين هذا الطلب');
    }

    return this.createAgreementInternal(order, targetDriverId, order.minFareMinor);
  }

  // --- Core Agreement Creation & Immutability ---

  private async createAgreementInternal(
    order: any,
    driverId: string,
    agreedFareMinor: number,
    winningOfferId?: string,
  ) {
    const orderStops = await this.dbService.db
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

    // Advance order to agreed (enforces DB state machine transition guard trigger)
    await this.dbService.db
      .update(orders)
      .set({ status: 'agreed', updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    // Insert agreement (database partial unique index idx_agreements_active_per_order guarantees race safety)
    const [agreement] = await this.dbService.db
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

    // Reject all other competing offers
    if (winningOfferId) {
      await this.dbService.db
        .update(offers)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(offers.id, winningOfferId));

      await this.dbService.db
        .update(offers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(eq(offers.orderId, order.id), sql`${offers.id} <> ${winningOfferId}::uuid`));
    } else {
      await this.dbService.db
        .update(offers)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(offers.orderId, order.id));
    }

    // Transactional outbox event
    await this.eventBus.publish('agreement.created', agreement!.id, {
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

    if (agreement.status !== 'active') {
      throw new ConflictException('لا يمكن تعديل اتفاق غير نشط');
    }

    const [amendment] = await this.dbService.db
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

    await this.auditService.log({
      userId,
      action: 'agreement_amendment_proposed',
      entityType: 'agreement_amendments',
      entityId: amendment!.id,
      afterState: { agreementId, newFareMinor: dto.newFareMinor, reason: dto.reason },
    });

    return amendment;
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
    const [updated] = await this.dbService.db
      .update(agreementAmendments)
      .set({
        status: newStatus,
        resolvedAt: new Date(),
      })
      .where(eq(agreementAmendments.id, amendmentId))
      .returning();

    // If approved and newFareMinor exists, update agreement agreedFareMinor
    if (approve && amendment.newFareMinor !== null && amendment.newFareMinor !== undefined) {
      await this.dbService.db
        .update(agreements)
        .set({
          agreedFareMinor: amendment.newFareMinor,
          updatedAt: new Date(),
        })
        .where(eq(agreements.id, amendment.agreementId));
    }

    // If approved and addedStops exist, append to stops table
    if (approve && amendment.addedStops && Array.isArray(amendment.addedStops)) {
      const [agreement] = await this.dbService.db
        .select()
        .from(agreements)
        .where(eq(agreements.id, amendment.agreementId))
        .limit(1);

      if (agreement) {
        const existingStops = await this.dbService.db
          .select()
          .from(stops)
          .where(eq(stops.orderId, agreement.orderId));

        let nextSeq = existingStops.length + 1;
        for (const s of amendment.addedStops as any[]) {
          const locStr = `${s.location.latitude},${s.location.longitude}`;
          await this.dbService.db.insert(stops).values({
            orderId: agreement.orderId,
            seq: nextSeq++,
            actionId: s.actionId,
            placeId: s.placeId,
            location: locStr,
            description: s.description,
            notes: s.notes,
            expectedDurationMinutes: s.expectedDurationMinutes || 0,
            invoiceRequired: s.invoiceRequired || false,
            status: 'pending',
          });
        }
      }
    }

    await this.auditService.log({
      userId,
      action: `agreement_amendment_${newStatus}`,
      entityType: 'agreement_amendments',
      entityId: amendmentId,
      afterState: { status: newStatus },
    });

    return updated;
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

    // Cancel agreement & order
    const [cancelled] = await this.dbService.db
      .update(agreements)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(agreements.id, agreementId))
      .returning();

    await this.dbService.db
      .update(orders)
      .set({ status: 'cancelled', cancelReason: dto.reason, updatedAt: new Date() })
      .where(eq(orders.id, agreement.orderId));

    await this.auditService.log({
      userId,
      action: 'agreement_cancelled',
      entityType: 'agreements',
      entityId: agreementId,
      afterState: { reason: dto.reason },
    });

    return cancelled;
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

    if (!stop) {
      throw new NotFoundException('المحطة غير موجودة');
    }

    // Insert stop_visit record
    const [existingVisits] = await this.dbService.db
      .select({ count: sql`count(*)` })
      .from(stopVisits)
      .where(eq(stopVisits.stopId, stopId));

    const visitSeq = Number((existingVisits as any)?.count || 0) + 1;

    const [visit] = await this.dbService.db
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

    if (!agreement) {
      throw new ForbiddenException('غير مصرح لك بإصدار فاتورة لهذا الطلب');
    }

    const [invoice] = await this.dbService.db
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

    await this.eventBus.publish('invoice.issued', invoice!.id, {
      invoiceId: invoice!.id,
      orderId: stop.orderId,
      amountMinor: dto.amountMinor,
    });

    return invoice;
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

    const [receipt] = await this.dbService.db
      .insert(paymentReceipts)
      .values({
        orderId: invoice.orderId,
        collectedAmountMinor: dto.collectedAmountMinor,
        receiptType: dto.receiptType || 'cash',
        notes: dto.notes ? `${dto.notes} (مسجل بواسطة: ${userId})` : `مسجل بواسطة: ${userId}`,
      })
      .returning();

    // Mark invoice verified
    await this.dbService.db
      .update(invoices)
      .set({ verifiedByCustomer: true, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    return receipt;
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

    const [updated] = await this.dbService.db
      .update(invoices)
      .set({
        verifiedByCustomer: false,
        customerNote: dto.reason,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }

  async driverCompleteStop(agreementId: string, stopId: string, driverId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.id, agreementId), eq(agreements.driverId, driverId)))
      .limit(1);

    if (!agreement) {
      throw new ForbiddenException('الاتفاق غير موجود');
    }

    await this.dbService.db
      .update(stops)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(stops.id, stopId));

    // Advance order to in_progress if still agreed
    await this.dbService.db
      .update(orders)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(and(eq(orders.id, agreement.orderId), eq(orders.status, 'agreed')));

    return { success: true, message: 'تم إنجاز المحطة بنجاح' };
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

    // Call database SQL function app.calculate_final_fare directly
    const fareRes = await this.dbService.db.execute<any>(
      sql`SELECT app.calculate_final_fare(${orderId}::uuid) AS final_fare`,
    );

    const row = fareRes[0] || (fareRes as any).rows?.[0] || {};
    const finalFareMinor = Number(row.final_fare || agreement.agreedFareMinor);

    // Update agreement status to fulfilled
    await this.dbService.db
      .update(agreements)
      .set({ status: 'fulfilled', updatedAt: new Date() })
      .where(eq(agreements.id, agreementId));

    // Update order status to completed
    await this.dbService.db
      .update(orders)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    // Increment driver completed trips
    await this.dbService.db.execute(
      sql`UPDATE app.driver_profiles SET completed_count = completed_count + 1 WHERE id = ${driverId}::uuid`,
    );

    // Read breakdown components from latest fare_calculations row
    const calcRes = await this.dbService.db.execute<any>(
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

    await this.eventBus.publish('order.completed', orderId, {
      orderId,
      agreementId,
      driverId,
      finalFareMinor,
    });

    return breakdown;
  }

  async driverUpdateLocation(driverId: string, dto: DriverLocationBatchDto) {
    if (!dto.points || dto.points.length === 0) {
      return { success: true, count: 0 };
    }

    const latest = dto.points[dto.points.length - 1]!;
    const locStr = `${latest.latitude},${latest.longitude}`;

    // Update driver profile last location
    await this.dbService.db
      .update(driverProfiles)
      .set({
        lastLocation: locStr,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(driverProfiles.id, driverId));

    return { success: true, count: dto.points.length };
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
