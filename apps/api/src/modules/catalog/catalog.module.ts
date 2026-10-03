import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogFacade } from './catalog.facade.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogFacade],
  exports: [CatalogFacade],
})
export class CatalogModule {}
