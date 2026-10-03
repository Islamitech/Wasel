import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service.js';
import { IdentityController } from './identity.controller.js';
import { IdentityFacade } from './identity.facade.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { DevOtpProvider } from '../../common/providers/otp/dev-otp.provider.js';
import { OTP_PROVIDER_TOKEN } from '../../common/providers/otp/otp.provider.interface.js';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET || 'super_secret_jwt_access_key_min_32_chars_long',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    IdentityFacade,
    JwtAuthGuard,
    PermissionsGuard,
    {
      provide: OTP_PROVIDER_TOKEN,
      useClass: DevOtpProvider,
    },
  ],
  exports: [IdentityFacade, JwtAuthGuard, PermissionsGuard],
})
export class IdentityModule {}
