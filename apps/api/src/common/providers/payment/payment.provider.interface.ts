export interface CreatePaymentSessionOptions {
  subscriptionId: string;
  driverId: string;
  planId: string;
  amountMinor: number;
  phone: string;
  fullName?: string;
  email?: string;
}

export interface PaymentSessionResult {
  paymentUrl: string;
  paymentRef: string;
  expiresInSeconds?: number;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  paymentRef?: string;
  subscriptionId?: string;
  amountMinor?: number;
  isSuccessful?: boolean;
  rawPayload?: Record<string, unknown>;
}

export interface IPaymentProvider {
  readonly providerName: string;
  createPaymentSession(options: CreatePaymentSessionOptions): Promise<PaymentSessionResult>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown, query?: unknown): Promise<WebhookVerificationResult>;
  reconcilePayment(paymentRef: string): Promise<{ isPaid: boolean; amountMinor: number; status: string }>;
}

export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER_TOKEN';
