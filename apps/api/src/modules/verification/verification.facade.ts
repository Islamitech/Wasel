import { Injectable } from '@nestjs/common';

@Injectable()
export class VerificationFacade {
  async getDriverVerificationStatus(_driverId: string) {
    return { verified: false, status: 'unverified' };
  }
}
