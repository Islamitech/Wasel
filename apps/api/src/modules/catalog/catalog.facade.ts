import { Injectable } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

@Injectable()
export class CatalogFacade {
  constructor(private readonly catalogService: CatalogService) {}

  async getVehicleTypes(regionId?: string) {
    return this.catalogService.getVehicleTypes(regionId);
  }
}
