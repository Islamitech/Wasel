import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  driverProfiles,
  vehicles,
  verificationDocuments,
  verificationLevels,
  subscriptions,
  subscriptionPlans,
  users,
} from '../../database/schema/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { AuditService } from '../audit/index.js';
import { S3StorageService } from '../../common/storage/s3-storage.service.js';
import {
  DriverProfileCreateDto,
  RegisterVehicleDto,
  SubmitDocumentDto,
  AdminReviewVerificationDto,
} from '@wasel/shared';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(S3StorageService) private readonly storageService: S3StorageService,
  ) {}

  async upsertDriverProfile(userId: string, dto: DriverProfileCreateDto) {
    return await this.dbService.transaction(
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(driverProfiles)
          .where(eq(driverProfiles.id, userId))
          .limit(1);

        let profile = existing;
        if (!existing) {
          const [created] = await tx
            .insert(driverProfiles)
            .values({
              id: userId,
              regionId: dto.regionId,
              status: 'pending',
            })
            .returning();
          profile = created;

          // Automatically grant 30-day free trial subscription to new driver
          const [trialPlan] = await tx
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.code, 'trial_30d'))
            .limit(1);

          if (trialPlan) {
            const startsAt = new Date();
            const endsAt = new Date(startsAt.getTime() + trialPlan.durationDays * 24 * 60 * 60 * 1000);
            await tx.insert(subscriptions).values({
              driverId: userId,
              planId: trialPlan.id,
              startsAt,
              endsAt,
              status: 'active',
              isTrial: true,
            });

            await this.auditService.log({
              userId,
              action: 'trial_granted',
              entityType: 'subscriptions',
              entityId: trialPlan.id,
              afterState: { driverId: userId, planCode: 'trial_30d', endsAt },
            });
          }
        } else if (dto.regionId) {
          const [updated] = await tx
            .update(driverProfiles)
            .set({ regionId: dto.regionId, updatedAt: new Date() })
            .where(eq(driverProfiles.id, userId))
            .returning();
          profile = updated;
        }

        return profile;
      },
      { actor: 'driver' },
    );
  }

  async registerVehicle(userId: string, dto: RegisterVehicleDto) {
    // Ensure driver profile exists
    await this.upsertDriverProfile(userId, {});

    const [vehicle] = await this.dbService.db
      .insert(vehicles)
      .values({
        driverId: userId,
        vehicleTypeId: dto.vehicleTypeId,
        plate: dto.plate,
        photoKey: dto.photoKey,
        status: 'pending',
      })
      .returning();

    return vehicle;
  }

  async getUploadUrl(userId: string, mediaType: string) {
    const bucket = process.env.STORAGE_PRIVATE_BUCKET || 'wasel-identity-private';
    const ext = mediaType.split('/')[1] || 'jpg';
    const fileKey = `drivers/${userId}/${crypto.randomUUID()}.${ext}`;

    const res = await this.storageService.getPresignedUploadUrl(bucket, fileKey, mediaType, 900);
    return {
      uploadUrl: res.uploadUrl,
      storageKey: res.fileKey,
      expiresInSeconds: res.expiresInSeconds,
    };
  }

  async submitDocument(userId: string, dto: SubmitDocumentDto) {
    await this.upsertDriverProfile(userId, {});

    return await this.dbService.transaction(
      async (tx) => {
        const [doc] = await tx
          .insert(verificationDocuments)
          .values({
            driverId: userId,
            type: dto.type,
            storageKey: dto.storageKey,
            encryptedMetadata: dto.encryptedMetadata,
            status: 'pending',
          })
          .returning();

        // Advance driver status to under_review if pending or rejected
        const [profile] = await tx
          .select()
          .from(driverProfiles)
          .where(eq(driverProfiles.id, userId))
          .limit(1);

        if (profile && (profile.status === 'pending' || profile.status === 'rejected')) {
          await tx
            .update(driverProfiles)
            .set({ status: 'under_review', updatedAt: new Date() })
            .where(eq(driverProfiles.id, userId));
        }

        return doc;
      },
      { actor: 'driver' },
    );
  }

  async getVerificationStatus(userId: string) {
    const [profile] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, userId))
      .limit(1);

    const docs = await this.dbService.db
      .select()
      .from(verificationDocuments)
      .where(eq(verificationDocuments.driverId, userId))
      .orderBy(desc(verificationDocuments.createdAt));

    let levelRank = 0;
    let levelNameAr = 'غير موثق (قيد المراجعة)';

    if (profile?.verificationLevelId) {
      const [level] = await this.dbService.db
        .select()
        .from(verificationLevels)
        .where(eq(verificationLevels.id, profile.verificationLevelId))
        .limit(1);
      if (level) {
        levelRank = level.rank;
        levelNameAr = level.nameAr;
      }
    }

    const requiredDocs = ['national_id_front', 'national_id_back', 'driver_license', 'vehicle_license'];
    const submittedTypes = docs.map((d) => d.type);
    const missing = requiredDocs.filter((r) => !submittedTypes.includes(r));

    return {
      status: profile?.status || 'pending',
      verificationLevelRank: levelRank,
      verificationLevelNameAr: levelNameAr,
      missingDocumentTypes: missing,
      submittedDocuments: docs.map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        rejectReason: d.rejectReason,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  async adminListVerifications(statusFilter?: string) {
    const conditions: any[] = [];
    if (statusFilter) {
      conditions.push(eq(verificationDocuments.status, statusFilter));
    }

    const docs = await this.dbService.db
      .select({
        doc: verificationDocuments,
        user: {
          id: users.id,
          fullName: users.fullName,
          phone: users.phone,
        },
      })
      .from(verificationDocuments)
      .innerJoin(users, eq(verificationDocuments.driverId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(verificationDocuments.createdAt))
      .limit(50);

    return docs.map((item) => ({
      ...item.doc,
      driverName: item.user.fullName,
      driverPhone: item.user.phone,
    }));
  }

  async adminReviewDocument(docId: string, adminUserId: string, dto: AdminReviewVerificationDto) {
    return await this.dbService.transaction(
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(verificationDocuments)
          .where(eq(verificationDocuments.id, docId))
          .limit(1);

        if (!doc) {
          throw new NotFoundException('المستند غير موجود');
        }

        const [updated] = await tx
          .update(verificationDocuments)
          .set({
            status: dto.status,
            rejectReason: dto.rejectReason || null,
            reviewedBy: adminUserId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(verificationDocuments.id, docId))
          .returning();

        // If approved, check if driver now satisfies level 1
        if (dto.status === 'approved') {
          const allApprovedDocs = await tx
            .select()
            .from(verificationDocuments)
            .where(
              and(
                eq(verificationDocuments.driverId, doc.driverId),
                eq(verificationDocuments.status, 'approved'),
              ),
            );

          const approvedTypes = allApprovedDocs.map((d) => d.type);
          const hasBasicKyc =
            approvedTypes.includes('national_id_front') &&
            approvedTypes.includes('national_id_back') &&
            approvedTypes.includes('driver_license');

          if (hasBasicKyc) {
            const [lvl1] = await tx
              .select()
              .from(verificationLevels)
              .where(eq(verificationLevels.code, 'level_1_basic'))
              .limit(1);

            if (lvl1) {
              await tx
                .update(driverProfiles)
                .set({
                  status: 'approved',
                  verificationLevelId: lvl1.id,
                  updatedAt: new Date(),
                })
                .where(eq(driverProfiles.id, doc.driverId));
            }
          }
        }

        await this.auditService.log({
          userId: adminUserId,
          action: `document_verification_${dto.status}`,
          entityType: 'verification_documents',
          entityId: docId,
          beforeState: { status: doc.status },
          afterState: { status: dto.status, rejectReason: dto.rejectReason },
        });

        return updated;
      },
      { actor: 'admin' },
    );
  }

  async adminApproveOrRejectDriver(driverId: string, adminUserId: string, approve: boolean, reason?: string, levelId?: string) {
    return await this.dbService.transaction(
      async (tx) => {
        const [profile] = await tx
          .select()
          .from(driverProfiles)
          .where(eq(driverProfiles.id, driverId))
          .limit(1);

        if (!profile) {
          throw new NotFoundException('ملف الكابتن غير موجود');
        }

        const newStatus = approve ? 'approved' : 'rejected';
        const [updated] = await tx
          .update(driverProfiles)
          .set({
            status: newStatus,
            verificationLevelId: levelId || profile.verificationLevelId,
            updatedAt: new Date(),
          })
          .where(eq(driverProfiles.id, driverId))
          .returning();

        await this.auditService.log({
          userId: adminUserId,
          action: `driver_${newStatus}`,
          entityType: 'driver_profiles',
          entityId: driverId,
          beforeState: { status: profile.status, levelId: profile.verificationLevelId },
          afterState: { status: newStatus, reason, levelId },
        });

        return updated;
      },
      { actor: 'admin' },
    );
  }
}
