import { Injectable } from '@nestjs/common';

@Injectable()
export class PricingFacade {
  async calculateEstimate(_orderParams: Record<string, unknown>) {
    return { estimatedCents: 0, currency: 'EGP' };
  }
}
