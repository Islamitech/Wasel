import { Injectable, Logger } from '@nestjs/common';
import { IOtpProvider, SendOtpOptions, SendOtpResult } from './otp.provider.interface.js';
import { AppConfigService } from '../../../config/config.service.js';

@Injectable()
export class WhatsAppCloudOtpProvider implements IOtpProvider {
  readonly providerName = 'whatsapp';
  private readonly logger = new Logger(WhatsAppCloudOtpProvider.name);

  constructor(private readonly configService?: AppConfigService) {}

  /**
   * Sends OTP via Meta WhatsApp Cloud API v19.0
   * Message template strictly in Arabic:
   * "رمز التحقق الخاص بك لمنصة واصل هو: {code}. صالح لمدة 5 دقائق. لا تشاركه مع أحد."
   */
  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    const phoneNumberId =
      this.configService?.get('WHATSAPP_PHONE_NUMBER_ID') || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken =
      this.configService?.get('WHATSAPP_ACCESS_TOKEN') || process.env.WHATSAPP_ACCESS_TOKEN;

    const messageText = `رمز التحقق الخاص بك لمنصة واصل هو: ${options.code}. صالح لمدة 5 دقائق. لا تشاركه مع أحد.`;

    // Normalize phone number (E.164 without leading +)
    const formattedPhone = options.phone.replace(/\D/g, '');

    if (!phoneNumberId || !accessToken) {
      if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'development') {
        this.logger.debug(
          `[MOCK WHATSAPP] To: ${options.phone} | Body: "${messageText}"`,
        );
        return {
          success: true,
          messageId: `wamid.mock-${Date.now()}`,
          provider: this.providerName,
          deliveryStatus: 'sent',
          costMinor: 20, // 0.20 EGP approximate WhatsApp utility template cost
        };
      }
      throw new Error('WhatsApp Cloud credentials (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) are missing');
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: messageText,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`WhatsApp API responded with status ${response.status}: ${errorBody}`);
      }

      const resData = (await response.json()) as { messages?: Array<{ id: string }> };
      const messageId = resData.messages?.[0]?.id || `wamid-${Date.now()}`;

      this.logger.log(`✅ WhatsApp OTP dispatched to ${options.phone} (msgId: ${messageId})`);

      return {
        success: true,
        messageId,
        provider: this.providerName,
        deliveryStatus: 'sent',
        costMinor: 20,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Failed to send WhatsApp OTP to ${options.phone}: ${msg}`);
      return {
        success: false,
        provider: this.providerName,
        deliveryStatus: 'failed',
        error: msg,
      };
    }
  }
}
