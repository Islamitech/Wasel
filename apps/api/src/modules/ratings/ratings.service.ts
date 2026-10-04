import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  ratings,
  disputes,
  disputeEvents,
  agreements,
  orders,
  driverProfiles,
  verificationLevels,
  users,
} from '../../database/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import {
  CreateRatingDto,
  CreateDisputeDto,
  DisputeEventDto,
  ResolveDisputeDto,
  ErrorCode,
  UserRole,
} from '@wasel/shared';

@Injectable()
export class RatingsService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async createRating(agreementId: string, reviewerId: string, dto: CreateRatingDto) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) {
      throw new NotFoundException('الاتفاق غير موجود');
    }

    if (agreement.status !== 'completed' && agreement.status !== 'fulfilled') {
      throw new BadRequestException({
        errorCode: ErrorCode.RATING_NOT_ALLOWED,
        message: 'لا يمكن تقييم الرحلة قبل اكتمالها',
      });
    }

    if (!Number.isInteger(dto.score) || dto.score < 1 || dto.score > 5) {
      throw new BadRequestException({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'درجة التقييم يجب أن تكون رقماً صحيحاً بين 1 و 5',
      });
    }

    const isCustomer = agreement.customerId === reviewerId;
    const isDriver = agreement.driverId === reviewerId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بتقييم هذه الرحلة',
      });
    }

    const [existing] = await this.dbService.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.orderId, agreement.orderId), eq(ratings.reviewerId, reviewerId)))
      .limit(1);

    if (existing) {
      throw new ConflictException({
        errorCode: ErrorCode.RATING_ALREADY_SUBMITTED,
        message: 'تم تسجيل تقييم لهذه الرحلة بالفعل',
      });
    }

    const revieweeId = isCustomer ? agreement.driverId : agreement.customerId;
    const actor = isCustomer ? 'customer' : 'driver';

    try {
      return await this.dbService.transaction(
        async (tx) => {
          // Insert rating (database trigger trg_ratings_update_aggregates updates profile rating_avg and rating_count)
          const [rating] = await tx
            .insert(ratings)
            .values({
              orderId: agreement.orderId,
              reviewerId,
              revieweeId,
              score: dto.score,
              tags: dto.tags || [],
              comment: dto.comment,
            })
            .returning();

          return rating;
        },
        { actor },
      );
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const code = typeof errObj?.code === 'string' ? errObj.code : '';
      const message = typeof errObj?.message === 'string' ? errObj.message : '';
      if (code === '23505' || message.includes('duplicate key') || message.includes('unique')) {
        throw new ConflictException({
          errorCode: ErrorCode.RATING_ALREADY_SUBMITTED,
          message: 'تم تسجيل تقييم لهذه الرحلة بالفعل',
        });
      }
      throw err;
    }
  }

  async getDriverReputation(driverId: string) {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, driverId))
      .limit(1);

    const [profile] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverId))
      .limit(1);

    if (!user || !profile) {
      throw new NotFoundException('الكابتن غير موجود');
    }

    let verificationRank = 0;
    let verificationLevelNameAr = 'مبتدئ';

    if (profile.verificationLevelId) {
      const [level] = await this.dbService.db
        .select()
        .from(verificationLevels)
        .where(eq(verificationLevels.id, profile.verificationLevelId))
        .limit(1);
      if (level) {
        verificationRank = level.rank;
        verificationLevelNameAr = level.nameAr;
      }
    }

    return {
      driverId,
      fullName: user.fullName || 'كابتن واصل',
      ratingAvg: Number(profile.ratingAvg || 5.0),
      ratingCount: profile.ratingCount || 0,
      completedCount: profile.completedCount || 0,
      acceptanceRate: Number(profile.acceptanceRate || 100.0),
      verificationRank,
      verificationLevelNameAr,
    };
  }

  async createDispute(userId: string, dto: CreateDisputeDto) {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, dto.orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundException('الطلب غير موجود');
    }

    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.orderId, dto.orderId))
      .limit(1);

    const isCustomer = order.customerId === userId;
    const isDriver = agreement?.driverId === userId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException({
        errorCode: ErrorCode.OWNERSHIP_VIOLATION,
        message: 'غير مصرح لك بفتح نزاع على هذا الطلب',
      });
    }

    return await this.dbService.transaction(
      async (tx) => {
        const [dispute] = await tx
          .insert(disputes)
          .values({
            orderId: dto.orderId,
            filedBy: userId,
            reason: dto.reason,
            description: dto.description,
            status: 'opened',
          })
          .returning();

        // Advance order to disputed if in_progress
        if (order.status === 'in_progress') {
          await tx
            .update(orders)
            .set({ status: 'disputed', updatedAt: new Date() })
            .where(eq(orders.id, dto.orderId));
        }

        await this.auditService.log({
          userId,
          action: 'dispute_filed',
          entityType: 'disputes',
          entityId: dispute!.id,
          afterState: { orderId: dto.orderId, reason: dto.reason },
        });

        return dispute;
      },
      { actor: isCustomer ? 'customer' : 'driver' },
    );
  }

  async listDisputes(userId: string, rolesList: string[]) {
    const isAdmin = rolesList.includes(UserRole.ADMIN) || rolesList.includes(UserRole.SUPPORT);

    if (isAdmin) {
      return this.dbService.db
        .select()
        .from(disputes)
        .orderBy(desc(disputes.createdAt))
        .limit(50);
    }

    return this.dbService.db
      .select()
      .from(disputes)
      .where(eq(disputes.filedBy, userId))
      .orderBy(desc(disputes.createdAt));
  }

  async adminAssignDispute(disputeId: string, adminUserId: string) {
    const [updated] = await this.dbService.db
      .update(disputes)
      .set({
        assignedAdminId: adminUserId,
        status: 'under_review',
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId))
      .returning();

    if (!updated) {
      throw new NotFoundException('النزاع غير موجود');
    }

    await this.auditService.log({
      userId: adminUserId,
      action: 'dispute_assigned',
      entityType: 'disputes',
      entityId: disputeId,
      afterState: { assignedAdminId: adminUserId, status: 'under_review' },
    });

    return updated;
  }

  async adminAddDisputeEvent(disputeId: string, adminUserId: string, dto: DisputeEventDto) {
    const [dispute] = await this.dbService.db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new NotFoundException('النزاع غير موجود');
    }

    const [ev] = await this.dbService.db
      .insert(disputeEvents)
      .values({
        disputeId,
        actorId: adminUserId,
        eventType: dto.eventType || 'investigation_note',
        details: { notes: dto.notes },
      })
      .returning();

    return ev;
  }

  async adminResolveDispute(disputeId: string, adminUserId: string, dto: ResolveDisputeDto) {
    const [dispute] = await this.dbService.db
      .select()
      .from(disputes)
      .where(eq(disputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new NotFoundException('النزاع غير موجود');
    }

    return await this.dbService.transaction(
      async (tx) => {
        const [resolved] = await tx
          .update(disputes)
          .set({
            status: dto.resolution,
            resolvedAt: new Date(),
            resolutionNotes: dto.resolutionNotes,
            updatedAt: new Date(),
          })
          .where(eq(disputes.id, disputeId))
          .returning();

        // Handle order outcome if specified
        if (dto.orderOutcome === 'complete') {
          await tx
            .update(orders)
            .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
            .where(eq(orders.id, dispute.orderId));
        } else if (dto.orderOutcome === 'cancel') {
          await tx
            .update(orders)
            .set({ status: 'cancelled', cancelReason: `حسم النزاع: ${dto.resolutionNotes}`, updatedAt: new Date() })
            .where(eq(orders.id, dispute.orderId));
        }

        await this.auditService.log({
          userId: adminUserId,
          action: `dispute_${dto.resolution}`,
          entityType: 'disputes',
          entityId: disputeId,
          afterState: { resolution: dto.resolution, notes: dto.resolutionNotes, orderOutcome: dto.orderOutcome },
        });

        return resolved;
      },
      { actor: 'admin' },
    );
  }
}
