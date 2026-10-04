import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IdentityService } from './identity.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { Permissions } from './decorators/permissions.decorator.js';
import { CurrentUser } from './decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  RequestOtpSchema,
  RequestOtpDto,
  VerifyOtpSchema,
  VerifyOtpDto,
  AdminLoginSchema,
  AdminLoginDto,
  RefreshTokenSchema,
  RefreshTokenDto,
  LogoutSchema,
  LogoutDto,
} from '@wasel/shared';

@ApiTags('Auth')
@Controller('auth')
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(RequestOtpSchema))
  @ApiOperation({ summary: 'Request OTP challenge for login/registration' })
  @ApiResponse({ status: 200, description: 'OTP challenge initiated' })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    return this.identityService.requestOtp(dto.phone, dto.role, ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(VerifyOtpSchema))
  @ApiOperation({ summary: 'Verify OTP code and receive session tokens' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.identityService.verifyOtp(
      dto.phone,
      dto.code,
      dto.deviceInfo,
      ip,
      userAgent,
      dto.role,
    );
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(AdminLoginSchema))
  @ApiOperation({ summary: 'Admin login with email and password' })
  @ApiResponse({ status: 200, description: 'Admin authentication successful' })
  async adminLogin(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.identityService.adminLogin(dto.email, dto.password, dto.deviceInfo, ip, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UsePipes(new ZodValidationPipe(RefreshTokenSchema))
  @ApiOperation({ summary: 'Rotate refresh token and obtain new access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.identityService.refreshAccessToken(dto.refreshToken, ip, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke active session' })
  async logout(
    @Body(new ZodValidationPipe(LogoutSchema)) dto: LogoutDto,
    @CurrentUser() user: any,
  ) {
    return this.identityService.logout(dto.refreshToken, user.sub, dto.allDevices, user.sessionId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getProfile(@CurrentUser() user: any) {
    return this.identityService.getUserProfile(user.sub);
  }

  @Get('admin/protected-check')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('users:read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check RBAC permissions enforcement' })
  async checkAdminAccess(@CurrentUser() user: any) {
    return {
      authorized: true,
      user,
      message: 'تم التحقق من الصلاحيات بنجاح (RBAC Authorized)',
    };
  }
}
