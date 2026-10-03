import { Module } from '@nestjs/common';
import { RatingsFacade } from './ratings.facade.js';

@Module({
  providers: [RatingsFacade],
  exports: [RatingsFacade],
})
export class RatingsModule {}
