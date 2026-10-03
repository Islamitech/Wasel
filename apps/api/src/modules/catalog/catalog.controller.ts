import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service.js';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('vehicle-types')
  @ApiOperation({ summary: 'List active vehicle types for a region' })
  @ApiQuery({ name: 'regionId', required: false })
  async getVehicleTypes(@Query('regionId') regionId?: string) {
    return this.catalogService.getVehicleTypes(regionId);
  }

  @Get('service-actions')
  @ApiOperation({ summary: 'List service actions (errands, parcel, moving)' })
  @ApiQuery({ name: 'regionId', required: false })
  async getServiceActions(@Query('regionId') regionId?: string) {
    return this.catalogService.getServiceActions(regionId);
  }

  @Get('value-tiers')
  @ApiOperation({ summary: 'List cargo value tiers and vehicle escalation policies' })
  @ApiQuery({ name: 'regionId', required: false })
  async getValueTiers(@Query('regionId') regionId?: string) {
    return this.catalogService.getValueTiers(regionId);
  }
}
