import { Injectable, Logger } from '@nestjs/common';
import { IOtpProvider, SendOtpOptions, SendOtpResult } from './otp.provider.interface.js';
import { AppConfigService } from '../../../config/config.service.js';

@Injectable()
export class SmsOtpProvider implements IOtpProvider {
  readonly providerName = 'sms';
  private readonly logger = new Logger(SmsOtpProvider.name);

  constructor(private readonly configService?: AppConfigService) {}

  /**
   * Sends OTP via SMS Gateway HTTP API
   * Message template strictly in Arabic:
   * "رمز التحقق الخاص بك لمنصة واصل هو: {code}. صالح لمدة 5 دقائق. لا تشاركه مع أحد."
   */
  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    const gatewayUrl =
      this.configService?.get('SMS_GATEWAY_URL') || process.env.SMS_GATEWAY_URL;
    const apiKey =
      this.configService?.get('SMS_API_KEY') || process.env.SMS_API_KEY;

    const messageText = `رمز التحقق الخاص بك لمنصة واصل هو: ${options.code}. صالح لمدة 5 دقائق. لا تشاركه مع أحد.`;

    if (!gatewayUrl || !apiKey) {
      if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'development') {
        this.logger.debug(
          `[MOCK SMS] To: ${options.phone} | Body: "${messageText}"`,
        );
        return {
          success: true,
          messageId: `sms.mock-${Date.now()}`,
          provider: this.providerName,
          deliveryStatus: 'sent',
          costMinor: 15, // 0.15 EGP approximate SMS gateway rate
        };
      }
      throw new Error('SMS Gateway credentials (SMS_GATEWAY_URL, SMS_API_KEY) are missing');
    }

    try {
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: options.phone,
          message: messageText,
          sender: 'Wasel',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SMS Gateway responded with status ${response.status}: ${errorText}`);
      }

      const resData = (await response.json().catch(() => ({}))) as { messageId?: string; id?: string };
      const messageId = resData.messageId || resData.id || `sms-${Date.now()}`;

      this.logger.log(`✅ SMS OTP dispatched to ${options.phone} (msgId: ${messageId})`);

      return {
        success: true,
        messageId,
        provider: this.providerName,
        deliveryStatus: 'sent',
        costMinor: 15,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Failed to send SMS OTP to ${options.phone}: ${msg}`);
      return {
        success: false,
        provider: this.providerName,
        deliveryStatus: 'failed',
        error: msg,
      };
    }
  }
}
