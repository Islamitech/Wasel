import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service.js';
import { MatchingController } from './matching.controller.js';
import { MatchingFacade } from './matching.facade.js';
import { SubscriptionsModule } from '../subscriptions/index.js';
import { VerificationModule } from '../verification/index.js';

@Module({
  imports: [SubscriptionsModule, VerificationModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingFacade],
  exports: [MatchingFacade, MatchingService],
})
export class MatchingModule {}
