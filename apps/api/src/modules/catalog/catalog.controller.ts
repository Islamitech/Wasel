import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service.js';
import {
  SearchPlacesQuerySchema,
  SearchPlacesQueryDto,
  SuggestPlaceSchema,
  SuggestPlaceDto,
} from '@wasel/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { JwtAuthGuard } from '../identity/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Catalog & Places')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Get unified platform catalog with ETag caching' })
  async getCatalog(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const { data, etag } = await this.catalogService.getCatalog();

    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(HttpStatus.NOT_MODIFIED).send();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('places')
  @ApiOperation({ summary: 'Search points of interest (places) by text query or proximity' })
  async searchPlaces(
    @Query(new ZodValidationPipe(SearchPlacesQuerySchema)) query: SearchPlacesQueryDto,
  ) {
    return this.catalogService.searchPlaces(query);
  }

  @Post('places')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suggest a missing place (pending admin verification)' })
  async suggestPlace(
    @Body(new ZodValidationPipe(SuggestPlaceSchema)) dto: SuggestPlaceDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.catalogService.suggestPlace(dto, userId);
  }

  @Get('catalog/vehicle-types')
  @ApiOperation({ summary: 'List active vehicle types' })
  async getVehicleTypes() {
    return this.catalogService.getVehicleTypes();
  }

  @Get('catalog/service-actions')
  @ApiOperation({ summary: 'List service actions' })
  async getServiceActions() {
    return this.catalogService.getServiceActions();
  }

  @Get('catalog/value-tiers')
  @ApiOperation({ summary: 'List cargo value tiers' })
  async getValueTiers() {
    return this.catalogService.getValueTiers();
  }
}
