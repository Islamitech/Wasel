import { Injectable, Module } from '@nestjs/common';

@Injectable()
export class AgreementsFacade {
  async getDriverAgreementStatus(_driverId: string) {
    return { agreed: false };
  }
}

@Module({
  providers: [AgreementsFacade],
  exports: [AgreementsFacade],
})
export class AgreementsModule {}

export * from './agreements.facade.js';
