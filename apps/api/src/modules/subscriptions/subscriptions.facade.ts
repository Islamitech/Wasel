import { Injectable } from '@nestjs/common';

@Injectable()
export class SubscriptionsFacade {
  async isDriverSubscribed(_driverId: string): Promise<boolean> {
    return false;
  }
}
