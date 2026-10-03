import { Injectable, Logger } from '@nestjs/common';
import { IOtpProvider, SendOtpOptions, SendOtpResult } from './otp.provider.interface.js';

@Injectable()
export class DevOtpProvider implements IOtpProvider {
  readonly providerName = 'dev';
  private readonly logger = new Logger(DevOtpProvider.name);

  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    this.logger.log(
      `📱 [DEV OTP] Sent code "${options.code}" to ${options.phone} (expires in ${options.expiresInMinutes} mins)`,
    );
    return {
      success: true,
      messageId: `dev-${Date.now()}`,
      provider: this.providerName,
    };
  }
}
