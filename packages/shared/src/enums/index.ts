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

/**
 * Approved Fleet Vehicle Classes for Wasel
 */
export enum VehicleClass {
  BICYCLE = 'bicycle',
  MOTORCYCLE = 'motorcycle',
  TRICYCLE = 'tricycle',
  HALF_TRUCK = 'half_truck',
  JUMBO = 'jumbo',
}

/**
 * Catalog Service Action Codes
 */
export enum ServiceActionCode {
  BUY = 'buy',
  PICK = 'pick',
  DROP = 'drop',
  MOVE = 'move',
  FIND = 'find',
}

/**
 * Physical Cargo Load Sizes
 */
export enum LoadSizeCode {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  BULKY = 'bulky',
}

/**
 * Lifecycle status of an Order
 */
export enum OrderStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  MATCHING = 'matching',
  OFFERS_RECEIVED = 'offers_received',
  AGREED = 'agreed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/**
 * Wait Mode preference
 */
export enum WaitMode {
  WAIT = 'wait',
  NOTIFY = 'notify',
}

/**
 * Agreement Lifecycle Status
 */
export enum AgreementStatus {
  ACTIVE = 'active',
  FULFILLED = 'fulfilled',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

/**
 * Subscription Status
 */
export enum SubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Dispute Status
 */
export enum DisputeStatus {
  OPENED = 'opened',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
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
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
