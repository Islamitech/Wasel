import { Injectable } from '@nestjs/common';

@Injectable()
export class AgreementsFacade {
  async getDriverAgreementStatus(_driverId: string) {
    return { agreed: false };
  }
}
