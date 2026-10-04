import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { driverProfiles, verificationLevels } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class VerificationFacade {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getDriverVerificationStatus(driverId: string) {
    const [profile] = await this.dbService.db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.id, driverId))
      .limit(1);

    if (!profile) return { verified: false, status: 'unverified', rank: 0, allowedValueTierIds: [] };

    if (!profile.verificationLevelId) {
      return { verified: false, status: profile.status, rank: 0, allowedValueTierIds: [] };
    }

    const [level] = await this.dbService.db
      .select()
      .from(verificationLevels)
      .where(eq(verificationLevels.id, profile.verificationLevelId))
      .limit(1);

    return {
      verified: profile.status === 'approved',
      status: profile.status,
      rank: level?.rank || 0,
      allowedValueTierIds: (level?.allowedValueTierIds as string[]) || [],
    };
  }

  async isDriverEligibleForValueTier(driverId: string, valueTierId?: string | null): Promise<boolean> {
    if (!valueTierId) return true;

    const status = await this.getDriverVerificationStatus(driverId);
    if (!status.verified) return false;

    // Check if valueTierId is in driver's allowed value tier list
    return (status.allowedValueTierIds || []).includes(valueTierId);
  }
}
