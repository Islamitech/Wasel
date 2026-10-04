import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { agreements } from '../../database/schema/index.js';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class AgreementsFacade {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getActiveAgreementForOrder(orderId: string) {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(and(eq(agreements.orderId, orderId), eq(agreements.status, 'active')))
      .limit(1);

    return agreement || null;
  }

  async isUserPartyToAgreement(agreementId: string, userId: string): Promise<boolean> {
    const [agreement] = await this.dbService.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, agreementId))
      .limit(1);

    if (!agreement) return false;
    return agreement.customerId === userId || agreement.driverId === userId;
  }
}
