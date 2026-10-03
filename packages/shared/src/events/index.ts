export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  name: string;
  aggregateId: string;
  payload: T;
  timestamp: string;
  version: number;
}

export interface UserRegisteredPayload {
  userId: string;
  phone: string;
  role: string;
  regionId: string;
}

export interface UserAuthenticatedPayload {
  userId: string;
  sessionId: string;
  role: string;
  ipAddress?: string;
}

export interface SessionRevokedPayload {
  userId: string;
  sessionId: string;
}

export interface SettingUpdatedPayload {
  key: string;
  regionId?: string;
  updatedBy: string;
}

export type DomainEventNames =
  | 'user.registered'
  | 'user.authenticated'
  | 'user.logged_out'
  | 'session.revoked'
  | 'otp.requested'
  | 'otp.verified'
  | 'setting.updated';
