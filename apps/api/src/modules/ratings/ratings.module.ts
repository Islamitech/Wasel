import { Module } from '@nestjs/common';
import { RatingsService } from './ratings.service.js';
import { RatingsController } from './ratings.controller.js';
import { RatingsFacade } from './ratings.facade.js';
import { AuditModule } from '../audit/index.js';

@Module({
  imports: [AuditModule],
  controllers: [RatingsController],
  providers: [RatingsService, RatingsFacade],
  exports: [RatingsFacade, RatingsService],
})
export class RatingsModule {}
