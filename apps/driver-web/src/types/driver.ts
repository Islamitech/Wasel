import {
  AgreementResponseDto,
  InvoiceResponseDto,
  OrderDetailsDto,
  UserDto,
} from '@wasel/api-client';

export interface ActiveAgreementWithOrder extends AgreementResponseDto {
  order?: OrderDetailsDto;
}

export type DriverSheetState =
  | 'auth'
  | 'onboarding'
  | 'off'
  | 'waiting'
  | 'incoming'
  | 'bidding'
  | 'run'
  | 'done'
  | 'error';

export type ThemeMode = 'light' | 'dark' | 'sunlight';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DriverVerificationInfo {
  level: number;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  missingRequirements: string[];
  rejectionReason?: string;
  allowedValueTierCodes?: string[];
}

export interface DriverSubscriptionInfo {
  isActive: boolean;
  planCode: string;
  planNameAr: string;
  expiresAt: string;
  remainingDays: number;
  isTrial: boolean;
}

export interface IncomingOrderStop {
  id: string;
  seq: number;
  actionCode: string;
  actionNameAr: string;
  placeNameAr?: string;
  addressLabel?: string;
  notes?: string;
  expectedDurationMinutes?: number;
  invoiceRequired?: boolean;
  latitude: number;
  longitude: number;
}

export interface IncomingOrderCard {
  orderId: string;
  orderType: 'shopping' | 'delivery' | 'moving';
  minFareMinor: number;
  suggestedFareMinor?: number;
  distanceMeters: number;
  billableVisits: number;
  valueTierNameAr: string;
  loadSizeNameAr: string;
  waitMode: 'wait' | 'notify';
  stops: IncomingOrderStop[];
  expiresAt: string;
  rawOrder: OrderDetailsDto;
}

export interface BiddingState {
  orderId: string;
  suggestedFareMinor: number;
  currentOfferMinor: number;
  round: number;
  maxRounds: number;
  customerCounterMinor?: number;
  status: 'editing' | 'sent_waiting' | 'counter_received' | 'rejected' | 'expired';
}

export type RunStopPhase =
  | 'to_stop'
  | 'at_stop'
  | 'waiting'
  | 'invoice_entry'
  | 'payment_pending'
  | 'stop_completed';

export interface SettlementBreakdown {
  visitsFeeMinor: number;
  waitFeeMinor: number;
  goodsCommissionMinor: number;
  invoicesTotalMinor: number;
  totalFareMinor: number;
  formattedTotalFare: string;
  currency: string;
}

export interface TodayEarnings {
  completedTripsCount: number;
  totalEarningsMinor: number;
  formattedTotalEarnings: string;
}

export interface OfflineAction {
  id: string;
  idempotencyKey: string;
  type:
    | 'ARRIVE'
    | 'START_WAIT'
    | 'END_WAIT'
    | 'ISSUE_INVOICE'
    | 'RECORD_PAYMENT'
    | 'COMPLETE_STOP'
    | 'COMPLETE_AGREEMENT'
    | 'ADD_INFLIGHT_STOP';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  payload?: any;
  timestamp: number;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retryCount: number;
  errorMessage?: string;
}

export interface DriverAppState {
  sheetState: DriverSheetState;
  theme: ThemeMode;
  user: UserDto | null;
  driverLocation: Coordinates;
  verification: DriverVerificationInfo | null;
  subscription: DriverSubscriptionInfo | null;
  incomingOrder: IncomingOrderCard | null;
  bidding: BiddingState | null;
  activeAgreement: ActiveAgreementWithOrder | null;
  currentStopIndex: number;
  currentStopPhase: RunStopPhase;
  waitStartTime: number | null;
  currentStopInvoice: InvoiceResponseDto | null;
  pendingAmendments: any[];
  settlement: SettlementBreakdown | null;
  todayEarnings: TodayEarnings;
  offlineQueueCount: number;
  isMenuOpen: boolean;
  isChatOpen: boolean;
  isCancelModalOpen: boolean;
  isWakeLockActive: boolean;
  errorMessage: string | null;
  errorActionLabel: string | null;
  errorActionType: string | null;
  onlineHeartbeatInterval: number; // in seconds
}
