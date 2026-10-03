import { Injectable, Module } from '@nestjs/common';

@Injectable()
export class VerificationFacade {
  async getDriverVerificationStatus(_driverId: string) {
    return { verified: false, status: 'unverified' };
  }
}

@Module({
  providers: [VerificationFacade],
  exports: [VerificationFacade],
})
export class VerificationModule {}

export * from './verification.facade.js';
