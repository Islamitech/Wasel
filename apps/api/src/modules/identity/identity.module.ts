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
import { WhatsAppCloudOtpProvider } from '../../common/providers/otp/whatsapp-cloud-otp.provider.js';
import { SmsOtpProvider } from '../../common/providers/otp/sms-otp.provider.js';
import { DualFailoverOtpProvider } from '../../common/providers/otp/dual-failover-otp.provider.js';
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
    WhatsAppCloudOtpProvider,
    SmsOtpProvider,
    DualFailoverOtpProvider,
    {
      provide: OTP_PROVIDER_TOKEN,
      inject: [AppConfigService, DualFailoverOtpProvider, WhatsAppCloudOtpProvider, SmsOtpProvider],
      useFactory: (
        configService: AppConfigService,
        dualProvider: DualFailoverOtpProvider,
        whatsappProvider: WhatsAppCloudOtpProvider,
        smsProvider: SmsOtpProvider,
      ) => {
        const provider = configService.get('OTP_PROVIDER');
        if (provider === 'dev') {
          return new DevOtpProvider();
        }
        if (provider === 'whatsapp') {
          return whatsappProvider;
        }
        if (provider === 'sms') {
          return smsProvider;
        }
        return dualProvider;
      },
    },
  ],
  exports: [IdentityFacade, JwtAuthGuard, PermissionsGuard, TokenService],
})
export class IdentityModule {}
