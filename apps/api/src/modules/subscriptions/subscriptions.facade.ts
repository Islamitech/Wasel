import { Injectable, Inject } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';

@Injectable()
export class SubscriptionsFacade {
  constructor(@Inject(SubscriptionsService) private readonly subsService: SubscriptionsService) {}

  async isDriverSubscribed(driverId: string): Promise<boolean> {
    return this.subsService.isDriverSubscribed(driverId);
  }
}
