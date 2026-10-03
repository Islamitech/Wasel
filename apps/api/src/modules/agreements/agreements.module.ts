import { Module } from '@nestjs/common';
import { AgreementsFacade } from './agreements.facade.js';

@Module({
  providers: [AgreementsFacade],
  exports: [AgreementsFacade],
})
export class AgreementsModule {}
