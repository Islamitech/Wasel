export interface SendOtpOptions {
  phone: string;
  code: string;
  expiresInMinutes: number;
  ip?: string;
  userId?: string;
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  provider: string;
  deliveryStatus?: 'sent' | 'delivered' | 'failed';
  costMinor?: number;
  error?: string;
}

export interface IOtpProvider {
  readonly providerName: string;
  sendOtp(options: SendOtpOptions): Promise<SendOtpResult>;
}

export const OTP_PROVIDER_TOKEN = 'OTP_PROVIDER_TOKEN';
