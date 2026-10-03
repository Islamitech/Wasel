export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER = 'driver',
  ADMIN = 'admin',
  SUPPORT = 'support',
}

export enum OtpChannel {
  DEV = 'dev',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum VehicleClass {
  BICYCLE = 'bicycle',
  MOTORCYCLE = 'motorcycle',
  TRICYCLE = 'tricycle',
  PICKUP = 'pickup',
  LIGHT_TRUCK = 'light_truck',
}

export enum ValueTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum OutboxStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  STATUS_CHANGE = 'status_change',
}

export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}
