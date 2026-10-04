import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service.js';
import { IdentityController } from './identity.controller.js';
import { MeController } from './me.controller.js';
import { IdentityFacade } from './identity.facade.js';
import { TokenService } from './token.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { DevOtpProvider } from '../../common/providers/otp/dev-otp.provider.js';
import { OTP_PROVIDER_TOKEN } from '../../common/providers/otp/otp.provider.interface.js';
import { AuditModule } from '../audit/index.js';
import { AppConfigService } from '../../config/config.service.js';

@Global()
@Module({
  imports: [
    AuditModule,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: '15m',
          algorithm: 'HS256',
          issuer: config.get('JWT_ISSUER'),
          audience: config.get('JWT_AUDIENCE'),
        },
      }),
    }),
  ],
  controllers: [IdentityController, MeController],
  providers: [
    TokenService,
    IdentityService,
    IdentityFacade,
    JwtAuthGuard,
    PermissionsGuard,
    {
      provide: OTP_PROVIDER_TOKEN,
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => {
        const provider = configService.get('OTP_PROVIDER');
        if (provider === 'dev') {
          return new DevOtpProvider();
        }
        if (provider === 'sms') {
          throw new Error('Fatal: SMS OTP provider requested but no production SMS gateway implementation is configured.');
        }
        if (provider === 'whatsapp') {
          throw new Error('Fatal: WhatsApp OTP provider requested but no production WhatsApp gateway implementation is configured.');
        }
        throw new Error(`Unsupported OTP provider: ${provider}`);
      },
    },
  ],
  exports: [IdentityFacade, JwtAuthGuard, PermissionsGuard, TokenService],
})
export class IdentityModule {}
