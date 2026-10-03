export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface IPushProvider {
  readonly providerName: string;
  sendNotification(subscription: PushSubscriptionData, payload: PushNotificationPayload): Promise<boolean>;
}

export const PUSH_PROVIDER_TOKEN = 'PUSH_PROVIDER_TOKEN';
