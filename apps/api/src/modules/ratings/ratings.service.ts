import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
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
import { eq, desc } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import {
  CreateRatingDto,
  CreateDisputeDto,
  DisputeEventDto,
  ResolveDisputeDto,
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

    const isCustomer = agreement.customerId === reviewerId;
    const isDriver = agreement.driverId === reviewerId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('غير مصرح لك بتقييم هذه الرحلة');
    }

    const revieweeId = isCustomer ? agreement.driverId : agreement.customerId;
    const actor = isCustomer ? 'customer' : 'driver';

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
      { actor: 'customer' },
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
