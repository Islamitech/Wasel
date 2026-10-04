import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IdentityService } from './identity.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PushDeviceRegistrationSchema, PushDeviceRegistrationDto } from '@wasel/shared';
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2, 'الاسم يجب أن لا يقل عن حرفين').optional(),
  regionId: z.string().uuid('معرف المنطقة غير صحيح').optional(),
});

type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

@ApiTags('User Profile (Me)')
@Controller('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MeController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile, roles, customer and driver status' })
  async getMe(@CurrentUser('userId') userId: string) {
    return this.identityService.getMe(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user profile details' })
  async updateMe(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.identityService.updateMe(userId, dto);
  }

  @Post('devices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or refresh Web Push notification subscription' })
  async registerPushDevice(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(PushDeviceRegistrationSchema)) dto: PushDeviceRegistrationDto,
  ) {
    return this.identityService.registerPushDevice(userId, dto);
  }

  @Get('customer')
  @ApiOperation({ summary: 'Get customer profile statistics' })
  async getCustomerProfile(@CurrentUser('userId') userId: string) {
    return this.identityService.getCustomerProfile(userId);
  }

  @Get('driver')
  @ApiOperation({ summary: 'Get driver profile and registered vehicles' })
  async getDriverProfile(@CurrentUser('userId') userId: string) {
    return this.identityService.getDriverProfile(userId);
  }
}
