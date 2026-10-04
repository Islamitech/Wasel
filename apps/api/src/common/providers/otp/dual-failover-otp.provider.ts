import {
  Injectable,
  Logger,
  Inject,
  Optional,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IOtpProvider, SendOtpOptions, SendOtpResult } from './otp.provider.interface.js';
import { WhatsAppCloudOtpProvider } from './whatsapp-cloud-otp.provider.js';
import { SmsOtpProvider } from './sms-otp.provider.js';
import { RedisService } from '../../redis/redis.service.js';
import { SettingsService } from '../../settings/settings.service.js';

@Injectable()
export class DualFailoverOtpProvider implements IOtpProvider {
  readonly providerName = 'dual_failover';
  private readonly logger = new Logger(DualFailoverOtpProvider.name);

  // In-memory rate-limiting fallback if Redis is unavailable
  private readonly memPhoneLimits = new Map<string, { count: number; resetAt: number }>();
  private readonly memIpLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(WhatsAppCloudOtpProvider) private readonly whatsappProvider: WhatsAppCloudOtpProvider,
    @Inject(SmsOtpProvider) private readonly smsProvider: SmsOtpProvider,
    @Optional() @Inject(RedisService) private readonly redisService?: RedisService,
    @Optional() @Inject(SettingsService) private readonly settingsService?: SettingsService,
  ) {}

  /**
   * Dispatches OTP with strict cost control, rate limits, SMS pumping anomaly detection,
   * primary WhatsApp delivery, and automatic SMS fallback.
   */
  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    // 1. Enforce Cost, Rate, and SMS-Pumping Limits
    await this.enforceCostAndPumpingLimits(options);

    // 2. Primary: WhatsApp Cloud API
    this.logger.debug(`Attempting primary OTP delivery via WhatsApp to ${options.phone}...`);
    try {
      const waResult = await this.whatsappProvider.sendOtp(options);
      if (waResult.success) {
        this.logger.log(`✅ Primary OTP delivered via WhatsApp to ${options.phone}`);
        return waResult;
      }
      this.logger.warn(
        `⚠️ WhatsApp OTP primary delivery failed (${waResult.error}). Initiating SMS fallback...`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`⚠️ WhatsApp OTP primary threw exception (${msg}). Initiating SMS fallback...`);
    }

    // 3. Fallback: SMS Gateway
    this.logger.debug(`Attempting secondary OTP delivery via SMS to ${options.phone}...`);
    try {
      const smsResult = await this.smsProvider.sendOtp(options);
      if (smsResult.success) {
        this.logger.log(`✅ Fallback OTP successfully delivered via SMS to ${options.phone}`);
        return smsResult;
      }
      throw new Error(smsResult.error || 'SMS fallback delivery failed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Both WhatsApp and SMS OTP providers failed for ${options.phone}: ${msg}`);
      throw new HttpException(
        'تعذر إرسال رمز التحقق في الوقت الحالي، يرجى المحاولة لاحقاً',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Cost controls & Anti-Fraud:
   * - Max 5 OTPs per phone per 24 hours
   * - Max 20 OTPs per IP per hour
   * - Daily global volume cap
   * - Anomaly detection: Rapid bursts from single IP / subnet targeting multiple distinct numbers
   */
  private async enforceCostAndPumpingLimits(options: SendOtpOptions): Promise<void> {
    const { phone, ip } = options;
    const redisClient = this.redisService?.getClient?.();

    const maxPerPhoneDaily =
      (await this.settingsService?.get<number>('otp_max_per_phone_daily', undefined, 5)) ?? 5;
    const maxPerIpHourly =
      (await this.settingsService?.get<number>('otp_max_per_ip_hourly', undefined, 20)) ?? 20;
    const globalDailyCap =
      (await this.settingsService?.get<number>('otp_global_daily_cap', undefined, 1000)) ?? 1000;

    if (redisClient) {
      // 1. Phone rate limit
      const phoneKey = `otp:daily:phone:${phone}`;
      const phoneCount = await redisClient.incr(phoneKey);
      if (phoneCount === 1) {
        await redisClient.expire(phoneKey, 24 * 3600);
      }
      if (phoneCount > maxPerPhoneDaily) {
        this.logger.warn(`🛑 Phone rate limit exceeded for ${phone} (${phoneCount}/${maxPerPhoneDaily})`);
        throw new HttpException(
          'تم تجاوز الحد الأقصى اليومي لطلبات التحقق لهذا الرقم (5 مرات كل 24 ساعة)',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 2. IP rate limit & SMS pumping detection
      if (ip) {
        const ipKey = `otp:hourly:ip:${ip}`;
        const ipCount = await redisClient.incr(ipKey);
        if (ipCount === 1) {
          await redisClient.expire(ipKey, 3600);
        }
        if (ipCount > maxPerIpHourly) {
          this.logger.warn(`🛑 IP rate limit exceeded for IP ${ip} (${ipCount}/${maxPerIpHourly})`);
          throw new HttpException(
            'تم تجاوز حد الطلبات المسموح به لعنوان الإنترنت الخاص بك',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        // Detect SMS pumping anomaly (rapid requests across different numbers within 2 minutes)
        const anomalyKey = `otp:pumping:ip:${ip}`;
        await redisClient.sadd(anomalyKey, phone);
        await redisClient.expire(anomalyKey, 120);
        const distinctNumbersCount = await redisClient.scard(anomalyKey);

        if (distinctNumbersCount >= 8) {
          this.logger.error(`🚨 SMS PUMPING ATTACK DETECTED from IP ${ip}! ${distinctNumbersCount} distinct numbers in 2m`);
          throw new HttpException(
            'تم رصد نشاط غير معتاد، تم حظر الطلب حماية للنظام',
            HttpStatus.FORBIDDEN,
          );
        }
      }

      // 3. Global daily cost limit
      const globalKey = 'otp:daily:global_count';
      const globalCount = await redisClient.incr(globalKey);
      if (globalCount === 1) {
        await redisClient.expire(globalKey, 24 * 3600);
      }
      if (globalCount > globalDailyCap) {
        this.logger.error(`🚨 Global daily OTP limit reached: ${globalCount}/${globalDailyCap}`);
        throw new HttpException(
          'تم الوصول للحد اليومي لرسائل التحقق، يرجى المحاولة غداً',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return;
    }

    // In-memory fallback
    const now = Date.now();
    const phoneRecord = this.memPhoneLimits.get(phone);
    if (phoneRecord && phoneRecord.resetAt > now) {
      if (phoneRecord.count >= maxPerPhoneDaily) {
        throw new HttpException(
          'تم تجاوز الحد الأقصى اليومي لطلبات التحقق لهذا الرقم',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      phoneRecord.count++;
    } else {
      this.memPhoneLimits.set(phone, { count: 1, resetAt: now + 24 * 3600 * 1000 });
    }

    if (ip) {
      const ipRecord = this.memIpLimits.get(ip);
      if (ipRecord && ipRecord.resetAt > now) {
        if (ipRecord.count >= maxPerIpHourly) {
          throw new HttpException(
            'تم تجاوز حد الطلبات المسموح به لعنوان الإنترنت الخاص بك',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        ipRecord.count++;
      } else {
        this.memIpLimits.set(ip, { count: 1, resetAt: now + 3600 * 1000 });
      }
    }
  }
}
