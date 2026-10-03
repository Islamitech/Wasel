import { Injectable } from '@nestjs/common';
import { RegionsService } from './regions.service.js';

@Injectable()
export class RegionsFacade {
  constructor(private readonly regionsService: RegionsService) {}

  async getDefaultRegion() {
    return this.regionsService.getRegionByCode('EG-GZ-HDA');
  }
}
