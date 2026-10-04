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
import { SubscriptionsService } from './subscriptions.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  AdminGrantSubscriptionSchema,
  AdminGrantSubscriptionDto,
  AdminRecordSubPaymentSchema,
  AdminRecordSubPaymentDto,
  UserRole,
} from '@wasel/shared';

@ApiTags('Driver Subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly subsService: SubscriptionsService) {}

  @Get('driver/subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current driver active subscription and trial details' })
  async getDriverSubscription(@CurrentUser('userId') driverId: string) {
    return this.subsService.getDriverSubscription(driverId);
  }

  @Get('subscription-plans')
  @ApiOperation({ summary: 'List public driver subscription packages' })
  async getSubscriptionPlans() {
    return this.subsService.getSubscriptionPlans();
  }

  @Post('admin/subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually grant, activate, or extend driver subscription plan' })
  async adminGrantSubscription(
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(AdminGrantSubscriptionSchema)) dto: AdminGrantSubscriptionDto,
  ) {
    return this.subsService.adminGrantSubscription(adminId, dto);
  }

  @Post('admin/subscriptions/:id/payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record manual cash / offline payment for driver subscription' })
  async adminRecordPayment(
    @Param('id') subscriptionId: string,
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(AdminRecordSubPaymentSchema)) dto: AdminRecordSubPaymentDto,
  ) {
    return this.subsService.adminRecordPayment(subscriptionId, adminId, dto);
  }
}
