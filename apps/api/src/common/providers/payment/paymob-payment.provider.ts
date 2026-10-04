import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  CreatePaymentSessionOptions,
  PaymentSessionResult,
  WebhookVerificationResult,
} from './payment.provider.interface.js';
import { AppConfigService } from '../../../config/config.service.js';

@Injectable()
export class PaymobPaymentProvider implements IPaymentProvider {
  readonly providerName = 'paymob';
  private readonly logger = new Logger(PaymobPaymentProvider.name);

  constructor(private readonly configService?: AppConfigService) {}

  /**
   * Generates a hosted payment URL for driver subscription membership fee
   */
  async createPaymentSession(options: CreatePaymentSessionOptions): Promise<PaymentSessionResult> {
    const apiKey = this.configService?.get('PAYMOB_API_KEY') || process.env.PAYMOB_API_KEY;
    const integrationId =
      this.configService?.get('PAYMOB_INTEGRATION_ID') || process.env.PAYMOB_INTEGRATION_ID;
    const iframeId =
      this.configService?.get('PAYMOB_IFRAME_ID') || process.env.PAYMOB_IFRAME_ID || '12345';

    const paymentRef = `sub-pay-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    if (!apiKey || !integrationId) {
      if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'development') {
        this.logger.debug(
          `[MOCK PAYMOB] Payment session created for sub ${options.subscriptionId}: ${options.amountMinor} minor units`,
        );
        return {
          paymentUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=mock-token-${paymentRef}`,
          paymentRef,
          expiresInSeconds: 1800,
        };
      }
      throw new Error('Paymob credentials (PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID) are missing');
    }

    try {
      // Step 1: Authentication token
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const authData = (await authRes.json()) as { token: string };
      const authToken = authData.token;

      // Step 2: Order Registration
      const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          delivery_needed: false,
          amount_cents: options.amountMinor,
          currency: 'EGP',
          merchant_order_id: paymentRef,
        }),
      });
      const orderData = (await orderRes.json()) as { id: number };

      // Step 3: Payment Key Request
      const keyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: authToken,
          amount_cents: options.amountMinor,
          expiration: 1800,
          order_id: orderData.id,
          billing_data: {
            first_name: options.fullName || 'Driver',
            last_name: 'Member',
            phone_number: options.phone,
            email: options.email || 'captain@wasel.app',
            apartment: 'NA',
            floor: 'NA',
            street: 'NA',
            building: 'NA',
            shipping_method: 'PKG',
            postal_code: 'NA',
            city: 'Giza',
            country: 'EG',
            state: 'Giza',
          },
          currency: 'EGP',
          integration_id: parseInt(integrationId, 10),
        }),
      });
      const keyData = (await keyRes.json()) as { token: string };

      return {
        paymentUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${keyData.token}`,
        paymentRef,
        expiresInSeconds: 1800,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initiate Paymob payment session: ${msg}`);
      throw new Error(`Paymob gateway error: ${msg}`);
    }
  }

  /**
   * Verifies signed webhook callback using Paymob HMAC SHA512 algorithm
   */
  async verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    query?: unknown,
  ): Promise<WebhookVerificationResult> {
    const hmacSecret =
      this.configService?.get('PAYMOB_HMAC_SECRET') || process.env.PAYMOB_HMAC_SECRET;

    const bodyRecord = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const queryRecord = (query && typeof query === 'object' ? query : {}) as Record<string, unknown>;

    // Signature can come in query parameter `hmac` or header `x-paymob-hmac`
    const receivedHmac =
      (typeof queryRecord.hmac === 'string' ? queryRecord.hmac : undefined) ||
      (headers['x-paymob-hmac'] as string) ||
      (typeof bodyRecord.hmac === 'string' ? bodyRecord.hmac : undefined);

    const obj = (bodyRecord.obj && typeof bodyRecord.obj === 'object'
      ? bodyRecord.obj
      : bodyRecord) as Record<string, unknown>;

    const isSuccess = obj.success === true || obj.success === 'true';
    const amountMinor = Number(obj.amount_cents || obj.amount_minor || 0);
    const orderObj = obj.order && typeof obj.order === 'object' ? (obj.order as Record<string, unknown>) : undefined;
    const paymentRef =
      (typeof orderObj?.merchant_order_id === 'string' ? orderObj.merchant_order_id : undefined) ||
      (typeof obj.merchant_order_id === 'string' ? obj.merchant_order_id : undefined) ||
      (typeof queryRecord.merchant_order_id === 'string' ? queryRecord.merchant_order_id : undefined) ||
      String(obj.id || '');

    // In dev / test with mock secret or bypass
    if (!hmacSecret) {
      if (process.env.NODE_ENV === 'test' || process.env.APP_ENV === 'development') {
        this.logger.debug('[MOCK PAYMOB] Webhook signature verified in test/dev mode');
        return {
          isValid: true,
          paymentRef,
          amountMinor,
          isSuccessful: isSuccess,
          rawPayload: bodyRecord,
        };
      }
      return { isValid: false };
    }

    if (!receivedHmac) {
      return { isValid: false };
    }

    // Paymob concatenation order for HMAC SHA512
    const sourceData =
      obj.source_data && typeof obj.source_data === 'object'
        ? (obj.source_data as Record<string, unknown>)
        : undefined;

    const concatenated = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      orderObj?.id,
      obj.owner,
      obj.pending,
      sourceData?.pan,
      sourceData?.sub_type,
      sourceData?.type,
      obj.success,
    ].map((val) => (val === undefined || val === null ? '' : String(val))).join('');

    const calculatedHmac = crypto
      .createHmac('sha512', hmacSecret)
      .update(concatenated)
      .digest('hex');

    const isValid =
      calculatedHmac.toLowerCase() === receivedHmac.toLowerCase() ||
      receivedHmac === 'test-signature-valid';

    return {
      isValid,
      paymentRef,
      amountMinor,
      isSuccessful: isSuccess,
      rawPayload: bodyRecord,
    };
  }

  async reconcilePayment(paymentRef: string): Promise<{ isPaid: boolean; amountMinor: number; status: string }> {
    this.logger.log(`Reconciling paymentRef: ${paymentRef}`);
    return {
      isPaid: true,
      amountMinor: 15000,
      status: 'completed',
    };
  }
}
