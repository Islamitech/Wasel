import { PlaceDto, OrderDetailsDto, OfferResponseDto, AgreementResponseDto, InvoiceResponseDto, MessageResponseDto } from '@wasel/api-client';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type PointType = 'shop' | 'customer_pin' | 'empty_point';

export interface SelectedMapPoint {
  coordinates: Coordinates;
  pointType: PointType;
  place?: PlaceDto | null;
  addressLabel?: string;
}

export interface CartStopItem {
  id: string;
  seq: number;
  actionId: string;
  actionCode: string;
  actionNameAr: string;
  placeId?: string | null;
  placeNameAr?: string | null;
  location: Coordinates;
  isFindItForMe?: boolean;
  description?: string;
  contactPhone?: string;
  notes?: string;
  voiceBlob?: Blob | null;
  voiceUrl?: string | null;
  photoFile?: File | null;
  photoUrl?: string | null;
  invoiceRequired?: boolean;
  expectedDurationMinutes?: number;
}

export interface CartDraft {
  orderId?: string | null;
  stops: CartStopItem[];
  valueTierId?: string | null;
  loadSizeId?: string | null;
  waitMode: 'wait' | 'notify';
  customerLocation: Coordinates;
  updatedAt: number;
}

export interface QuoteDetails {
  minFareMinor: number;
  formattedFareEgp: string;
  billableVisits: number;
  expectedWaitHours: number;
  suggestedVehicleClasses: string[];
}

export type CustomerSheetState =
  | 'idle'
  | 'actionMenu'
  | 'taskDetail'
  | 'cart'
  | 'searching'
  | 'offers'
  | 'tracking'
  | 'invoice'
  | 'done'
  | 'cancelled'
  | 'error';

export interface CustomerAppState {
  sheetState: CustomerSheetState;
  customerLocation: Coordinates;
  selectedPoint: SelectedMapPoint | null;
  currentDraftStop: Partial<CartStopItem> | null;
  cartStops: CartStopItem[];
  selectedValueTierId: string | null;
  selectedLoadSizeId: string | null;
  waitMode: 'wait' | 'notify';
  quote: QuoteDetails | null;
  activeOrderId: string | null;
  activeOrder: OrderDetailsDto | null;
  activeAgreement: AgreementResponseDto | null;
  offers: OfferResponseDto[];
  invoices: InvoiceResponseDto[];
  messages: MessageResponseDto[];
  errorMessage: string | null;
  errorActionLabel: string | null;
  isChatOpen: boolean;
  isCancelModalOpen: boolean;
}
