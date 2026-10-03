import { Module } from '@nestjs/common';
import { RegionsService } from './regions.service.js';
import { RegionsController } from './regions.controller.js';
import { RegionsFacade } from './regions.facade.js';

@Module({
  controllers: [RegionsController],
  providers: [RegionsService, RegionsFacade],
  exports: [RegionsFacade],
})
export class RegionsModule {}
