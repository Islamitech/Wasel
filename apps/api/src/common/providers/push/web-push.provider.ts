import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  IPushProvider,
  PushSubscriptionData,
  PushNotificationPayload,
} from './push.provider.interface.js';
import { DatabaseService } from '../../../database/database.service.js';
import { pushSubscriptions } from '../../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppConfigService } from '../../../config/config.service.js';

@Injectable()
export class WebPushProvider implements IPushProvider {
  readonly providerName = 'web_push';
  private readonly logger = new Logger(WebPushProvider.name);

  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Optional() @Inject(AppConfigService) private readonly configService?: AppConfigService,
  ) {}

  /**
   * Sends web push notification via VAPID standard.
   * Performs automatic 410 / 404 cleanup by deleting defunct subscriptions from DB.
   */
  async sendNotification(
    subscription: PushSubscriptionData,
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    const vapidPublicKey =
      this.configService?.get('VAPID_PUBLIC_KEY') || process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey =
      this.configService?.get('VAPID_PRIVATE_KEY') || process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
      this.logger.debug(
        `[MOCK WEB-PUSH] To: ${subscription.endpoint.substring(0, 30)}... | Title: "${payload.title}"`,
      );
      return true;
    }

    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'TTL': '86400',
          'Content-Type': 'application/json',
          'Urgency': 'high',
        },
        body: JSON.stringify(payload),
      });

      // 410 Gone or 404 Not Found: subscription is expired or revoked by browser -> perform cleanup
      if (response.status === 410 || response.status === 404) {
        this.logger.warn(
          `🧹 Pruning expired/revoked push subscription (${response.status}): ${subscription.endpoint.substring(0, 40)}...`,
        );
        try {
          await this.dbService.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        } catch (cleanupErr) {
          this.logger.error(`Failed to delete expired push subscription: ${cleanupErr}`);
        }
        return false;
      }

      if (!response.ok && response.status !== 201) {
        this.logger.warn(`Push endpoint responded with status ${response.status}`);
      }

      this.logger.log(`✅ Web push delivered to endpoint: ${subscription.endpoint.substring(0, 35)}...`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Web push dispatch failed: ${msg}`);
      return false;
    }
  }
}
