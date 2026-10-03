import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service.js';

@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active operating regions' })
  @ApiResponse({ status: 200, description: 'List of active regions' })
  async getActiveRegions() {
    return this.regionsService.listActiveRegions();
  }
}
