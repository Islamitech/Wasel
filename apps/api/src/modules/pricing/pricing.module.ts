import { Module } from '@nestjs/common';
import { PricingFacade } from './pricing.facade.js';

@Module({
  providers: [PricingFacade],
  exports: [PricingFacade],
})
export class PricingModule {}
