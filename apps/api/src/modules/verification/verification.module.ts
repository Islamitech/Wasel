import { Module } from '@nestjs/common';
import { VerificationFacade } from './verification.facade.js';

@Module({
  providers: [VerificationFacade],
  exports: [VerificationFacade],
})
export class VerificationModule {}
