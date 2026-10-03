import { Module } from '@nestjs/common';
import { MatchingFacade } from './matching.facade.js';

@Module({
  providers: [MatchingFacade],
  exports: [MatchingFacade],
})
export class MatchingModule {}
