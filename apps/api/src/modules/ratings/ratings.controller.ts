import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RatingsService } from './ratings.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  CreateRatingSchema,
  CreateRatingDto,
  CreateDisputeSchema,
  CreateDisputeDto,
  DisputeEventSchema,
  DisputeEventDto,
  ResolveDisputeSchema,
  ResolveDisputeDto,
  UserRole,
} from '@wasel/shared';

@ApiTags('Trust, Ratings & Disputes')
@Controller()
export class RatingsController {
  constructor(@Inject(RatingsService) private readonly ratingsService: RatingsService) {}

  @Post('agreements/:id/ratings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit mutual evaluation (1-5 stars) after trip completion' })
  async createRating(
    @Param('id') agreementId: string,
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(CreateRatingSchema)) dto: CreateRatingDto,
  ) {
    return this.ratingsService.createRating(agreementId, userId, dto);
  }

  @Get('drivers/:id/reputation')
  @ApiOperation({ summary: 'Public captain trust & reputation card (rating, completed trips, verification rank)' })
  async getDriverReputation(@Param('id') driverId: string) {
    return this.ratingsService.getDriverReputation(driverId);
  }

  @Post('disputes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'File a dispute or claim regarding an order or agreement' })
  async createDispute(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(CreateDisputeSchema)) dto: CreateDisputeDto,
  ) {
    return this.ratingsService.createDispute(userId, dto);
  }

  @Get('disputes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List filed disputes (users see own cases; admins see all)' })
  async listDisputes(
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.ratingsService.listDisputes(userId, rolesList || []);
  }

  // --- Admin Dispute Arbitration Endpoints ---

  @Post('admin/disputes/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign support agent or administrator to investigate dispute' })
  async assignDispute(
    @Param('id') disputeId: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.ratingsService.adminAssignDispute(disputeId, adminId);
  }

  @Post('admin/disputes/:id/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add note or event to dispute investigation log' })
  async addDisputeEvent(
    @Param('id') disputeId: string,
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(DisputeEventSchema)) dto: DisputeEventDto,
  ) {
    return this.ratingsService.adminAddDisputeEvent(disputeId, adminId, dto);
  }

  @Post('admin/disputes/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve or dismiss dispute with audit recording' })
  async resolveDispute(
    @Param('id') disputeId: string,
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(ResolveDisputeSchema)) dto: ResolveDisputeDto,
  ) {
    return this.ratingsService.adminResolveDispute(disputeId, adminId, dto);
  }
}
