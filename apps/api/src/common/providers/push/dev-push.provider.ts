import { Injectable, Logger } from '@nestjs/common';
import { IPushProvider, PushNotificationPayload, PushSubscriptionData } from './push.provider.interface.js';

@Injectable()
export class DevPushProvider implements IPushProvider {
  readonly providerName = 'dev';
  private readonly logger = new Logger(DevPushProvider.name);

  async sendNotification(subscription: PushSubscriptionData, payload: PushNotificationPayload): Promise<boolean> {
    this.logger.log(
      `🔔 [DEV PUSH] Sending to ${subscription.endpoint.slice(0, 30)}...: "${payload.title}" - ${payload.body}`,
    );
    return true;
  }
}
