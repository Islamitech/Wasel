import { Injectable, Inject } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { type DatabaseTransaction } from '../../database/database.service.js';

@Injectable()
export class SubscriptionsFacade {
  constructor(@Inject(SubscriptionsService) private readonly subsService: SubscriptionsService) {}

  async isDriverSubscribed(driverId: string, tx?: DatabaseTransaction): Promise<boolean> {
    return this.subsService.isDriverSubscribed(driverId, tx);
  }

  async grantTrialSubscriptionIfEligible(driverId: string, tx?: DatabaseTransaction): Promise<boolean> {
    return this.subsService.grantTrialSubscriptionIfEligible(driverId, tx);
  }
}

