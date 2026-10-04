import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MatchingService } from './matching.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '@wasel/shared';

@ApiTags('Driver Dispatch & Nearby Radar')
@Controller('driver/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MatchingController {
  constructor(@Inject(MatchingService) private readonly matchingService: MatchingService) {}

  @Get('nearby')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Driver radar view: list nearby eligible orders within search radius' })
  async getNearbyOrders(
    @CurrentUser('userId') driverId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const latNum = lat !== undefined && lat !== '' ? parseFloat(lat) : undefined;
    const lngNum = lng !== undefined && lng !== '' ? parseFloat(lng) : undefined;
    const radiusNum = radius !== undefined && radius !== '' ? parseInt(radius, 10) : undefined;
    const limitNum = limit !== undefined && limit !== '' ? parseInt(limit, 10) : 20;

    return this.matchingService.getNearbyOrders(driverId, {
      lat: latNum,
      lng: lngNum,
      radiusMeters: radiusNum,
      cursor,
      limit: limitNum,
    });
  }

  @Get(':id')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Driver card view: summary of stops, guaranteed minimum fare, and distance' })
  async getDriverOrderCard(
    @Param('id') orderId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.matchingService.getDriverOrderCard(orderId, driverId);
  }

  @Post(':id/decline')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Driver declines a candidate dispatch broadcast' })
  async declineOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.matchingService.declineOrder(orderId, driverId);
  }
}
