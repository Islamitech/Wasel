import {
  Coordinates,
  CustomerAppState,
  CustomerSheetState,
  CartStopItem,
  QuoteDetails,
  SelectedMapPoint,
  CartDraft,
} from '../types/customer.js';
import {
  AgreementResponseDto,
  InvoiceResponseDto,
  OfferResponseDto,
  OrderDetailsDto,
  PlaceDto,
  ServiceActionDto,
  OrderStatus,
} from '@wasel/api-client';

export type CustomerEvent =
  | { type: 'MAP_LONG_PRESS'; coords: Coordinates; nearestPlace?: PlaceDto | null; isNearCustomerPin?: boolean }
  | { type: 'SELECT_PLACE'; place: PlaceDto }
  | { type: 'CHOOSE_ACTION'; action: ServiceActionDto }
  | { type: 'UPDATE_DRAFT_STOP'; updates: Partial<CartStopItem> }
  | { type: 'ADD_STOP_AND_CONTINUE' }
  | { type: 'ADD_STOP_AND_FINISH' }
  | { type: 'ADD_NO_LOCATION_STOP'; action: ServiceActionDto }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'REORDER_STOPS'; fromIndex: number; toIndex: number }
  | { type: 'DELETE_STOP'; stopId: string }
  | { type: 'SET_VALUE_TIER'; tierId: string }
  | { type: 'SET_LOAD_SIZE'; loadSizeId: string }
  | { type: 'SET_WAIT_MODE'; waitMode: 'wait' | 'notify' }
  | { type: 'UPDATE_QUOTE'; quote: QuoteDetails }
  | { type: 'PUBLISH_ORDER_SUCCESS'; order: OrderDetailsDto }
  | { type: 'ORDER_UPDATED'; order: OrderDetailsDto }
  | { type: 'OFFERS_RECEIVED'; offers: OfferResponseDto[] }
  | { type: 'AGREEMENT_CREATED'; agreement: AgreementResponseDto }
  | { type: 'INVOICE_ISSUED'; invoice: InvoiceResponseDto }
  | { type: 'INVOICE_CONFIRMED'; invoiceId: string }
  | { type: 'AGREEMENT_COMPLETED'; agreement: AgreementResponseDto }
  | { type: 'ORDER_CANCELLED'; reason: string }
  | { type: 'RESET' }
  | { type: 'RESTORE_ORDER'; order: OrderDetailsDto; agreement?: AgreementResponseDto | null; invoices?: InvoiceResponseDto[] }
  | { type: 'RESTORE_DRAFT'; draft: CartDraft }
  | { type: 'SET_ERROR'; message: string; actionLabel?: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'TOGGLE_CHAT'; open?: boolean }
  | { type: 'SET_CUSTOMER_LOCATION'; coords: Coordinates };

export const INITIAL_CUSTOMER_STATE: CustomerAppState = {
  sheetState: 'idle',
  customerLocation: { latitude: 29.975, longitude: 31.115 },
  selectedPoint: null,
  currentDraftStop: null,
  cartStops: [],
  selectedValueTierId: null,
  selectedLoadSizeId: null,
  waitMode: 'wait',
  quote: null,
  activeOrderId: null,
  activeOrder: null,
  activeAgreement: null,
  offers: [],
  invoices: [],
  messages: [],
  errorMessage: null,
  errorActionLabel: null,
  isChatOpen: false,
  isCancelModalOpen: false,
};

export function customerReducer(state: CustomerAppState, event: CustomerEvent): CustomerAppState {
  switch (event.type) {
    case 'SET_CUSTOMER_LOCATION':
      return {
        ...state,
        customerLocation: event.coords,
      };

    case 'MAP_LONG_PRESS': {
      // Determine point type and snap
      const pointType = event.isNearCustomerPin
        ? 'customer_pin'
        : event.nearestPlace
        ? 'shop'
        : 'empty_point';

      const coords = event.isNearCustomerPin
        ? state.customerLocation
        : event.nearestPlace
        ? { latitude: event.nearestPlace.latitude, longitude: event.nearestPlace.longitude }
        : event.coords;

      const selectedPoint: SelectedMapPoint = {
        coordinates: coords,
        pointType,
        place: event.nearestPlace || null,
        addressLabel: event.nearestPlace?.nameAr || (event.isNearCustomerPin ? 'موقعي الحالي' : 'نقطة محددة على الخريطة'),
      };

      return {
        ...state,
        selectedPoint,
        sheetState: 'actionMenu',
      };
    }

    case 'SELECT_PLACE': {
      const selectedPoint: SelectedMapPoint = {
        coordinates: { latitude: event.place.latitude, longitude: event.place.longitude },
        pointType: 'shop',
        place: event.place,
        addressLabel: event.place.nameAr,
      };
      return {
        ...state,
        selectedPoint,
        sheetState: 'actionMenu',
      };
    }

    case 'CHOOSE_ACTION': {
      if (!state.selectedPoint) return state;
      const newDraftStop: Partial<CartStopItem> = {
        id: crypto.randomUUID ? crypto.randomUUID() : `stop-${Date.now()}`,
        seq: state.cartStops.length + 1,
        actionId: event.action.id,
        actionCode: event.action.code,
        actionNameAr: event.action.nameAr,
        placeId: state.selectedPoint.place?.id || null,
        placeNameAr: state.selectedPoint.place?.nameAr || state.selectedPoint.addressLabel,
        location: state.selectedPoint.coordinates,
        description: '',
        notes: '',
        expectedDurationMinutes: 15,
        invoiceRequired: event.action.code === 'buy',
      };

      return {
        ...state,
        currentDraftStop: newDraftStop,
        sheetState: 'taskDetail',
      };
    }

    case 'ADD_NO_LOCATION_STOP': {
      const newDraftStop: Partial<CartStopItem> = {
        id: crypto.randomUUID ? crypto.randomUUID() : `stop-${Date.now()}`,
        seq: state.cartStops.length + 1,
        actionId: event.action.id,
        actionCode: event.action.code,
        actionNameAr: event.action.nameAr,
        placeId: null,
        placeNameAr: 'طلب بلا مكان (الكابتن يحدد المحل)',
        location: state.customerLocation,
        isFindItForMe: true,
        description: '',
        notes: '',
        expectedDurationMinutes: 20,
        invoiceRequired: true,
      };

      return {
        ...state,
        selectedPoint: {
          coordinates: state.customerLocation,
          pointType: 'empty_point',
          addressLabel: 'طلب بلا مكان',
        },
        currentDraftStop: newDraftStop,
        sheetState: 'taskDetail',
      };
    }

    case 'UPDATE_DRAFT_STOP': {
      if (!state.currentDraftStop) return state;
      return {
        ...state,
        currentDraftStop: {
          ...state.currentDraftStop,
          ...event.updates,
        },
      };
    }

    case 'ADD_STOP_AND_CONTINUE': {
      if (!state.currentDraftStop) return state;
      const completeStop = state.currentDraftStop as CartStopItem;
      const updatedStops = [...state.cartStops, completeStop].map((s, idx) => ({ ...s, seq: idx + 1 }));
      return {
        ...state,
        cartStops: updatedStops,
        currentDraftStop: null,
        selectedPoint: null,
        sheetState: 'idle',
      };
    }

    case 'ADD_STOP_AND_FINISH': {
      if (!state.currentDraftStop) return state;
      const completeStop = state.currentDraftStop as CartStopItem;
      const updatedStops = [...state.cartStops, completeStop].map((s, idx) => ({ ...s, seq: idx + 1 }));
      return {
        ...state,
        cartStops: updatedStops,
        currentDraftStop: null,
        selectedPoint: null,
        sheetState: 'cart',
      };
    }

    case 'OPEN_CART': {
      return {
        ...state,
        sheetState: 'cart',
      };
    }

    case 'CLOSE_CART': {
      return {
        ...state,
        sheetState: 'idle',
      };
    }

    case 'REORDER_STOPS': {
      const { fromIndex, toIndex } = event;
      if (fromIndex < 0 || fromIndex >= state.cartStops.length || toIndex < 0 || toIndex >= state.cartStops.length) {
        return state;
      }
      const reordered = [...state.cartStops];
      const [moved] = reordered.splice(fromIndex, 1);
      if (moved) {
        reordered.splice(toIndex, 0, moved);
      }
      return {
        ...state,
        cartStops: reordered.map((s, idx) => ({ ...s, seq: idx + 1 })),
      };
    }

    case 'DELETE_STOP': {
      const filtered = state.cartStops.filter((s) => s.id !== event.stopId);
      const reindexed = filtered.map((s, idx) => ({ ...s, seq: idx + 1 }));
      return {
        ...state,
        cartStops: reindexed,
        sheetState: reindexed.length === 0 ? 'idle' : state.sheetState,
      };
    }

    case 'SET_VALUE_TIER': {
      return {
        ...state,
        selectedValueTierId: event.tierId,
      };
    }

    case 'SET_LOAD_SIZE': {
      return {
        ...state,
        selectedLoadSizeId: event.loadSizeId,
      };
    }

    case 'SET_WAIT_MODE': {
      return {
        ...state,
        waitMode: event.waitMode,
      };
    }

    case 'UPDATE_QUOTE': {
      return {
        ...state,
        quote: event.quote,
      };
    }

    case 'PUBLISH_ORDER_SUCCESS': {
      return {
        ...state,
        activeOrderId: event.order.id,
        activeOrder: event.order,
        sheetState: 'searching',
      };
    }

    case 'ORDER_UPDATED': {
      const order = event.order;
      let nextState: CustomerSheetState = state.sheetState;

      if (order.status === OrderStatus.AGREED || order.status === OrderStatus.IN_PROGRESS) {
        nextState = 'tracking';
      } else if (order.status === OrderStatus.COMPLETED) {
        nextState = 'done';
      } else if (order.status === OrderStatus.CANCELLED) {
        nextState = 'cancelled';
      } else if (order.status === OrderStatus.OFFERS_RECEIVED && state.sheetState === 'searching') {
        nextState = 'offers';
      }

      return {
        ...state,
        activeOrder: order,
        activeOrderId: order.id,
        sheetState: nextState,
      };
    }

    case 'OFFERS_RECEIVED': {
      return {
        ...state,
        offers: event.offers,
        sheetState: event.offers.length > 0 && state.sheetState === 'searching' ? 'offers' : state.sheetState,
      };
    }

    case 'AGREEMENT_CREATED': {
      return {
        ...state,
        activeAgreement: event.agreement,
        sheetState: 'tracking',
      };
    }

    case 'INVOICE_ISSUED': {
      const existing = state.invoices.filter((i) => i.id !== event.invoice.id);
      return {
        ...state,
        invoices: [...existing, event.invoice],
        sheetState: 'invoice',
      };
    }

    case 'INVOICE_CONFIRMED': {
      const updated = state.invoices.map((inv) =>
        inv.id === event.invoiceId ? { ...inv, verifiedByCustomer: true } : inv,
      );
      const anyUnverified = updated.some((inv) => !inv.verifiedByCustomer);
      return {
        ...state,
        invoices: updated,
        sheetState: anyUnverified ? 'invoice' : 'tracking',
      };
    }

    case 'AGREEMENT_COMPLETED': {
      return {
        ...state,
        activeAgreement: event.agreement,
        sheetState: 'done',
      };
    }

    case 'ORDER_CANCELLED': {
      return {
        ...state,
        sheetState: 'cancelled',
        errorMessage: `تم إلغاء الطلب: ${event.reason}`,
      };
    }

    case 'RESTORE_ORDER': {
      const { order, agreement, invoices } = event;
      let sheetState: CustomerSheetState = 'searching';

      if (order.status === OrderStatus.COMPLETED) {
        sheetState = 'done';
      } else if (agreement || order.status === OrderStatus.AGREED || order.status === OrderStatus.IN_PROGRESS) {
        const hasUnverifiedInvoice = (invoices || []).some((inv) => !inv.verifiedByCustomer);
        sheetState = hasUnverifiedInvoice ? 'invoice' : 'tracking';
      } else if (order.status === OrderStatus.OFFERS_RECEIVED) {
        sheetState = 'offers';
      } else if (order.status === OrderStatus.CANCELLED) {
        sheetState = 'cancelled';
      }

      return {
        ...state,
        activeOrderId: order.id,
        activeOrder: order,
        activeAgreement: agreement || null,
        invoices: invoices || [],
        sheetState,
      };
    }

    case 'RESTORE_DRAFT': {
      const draft = event.draft;
      return {
        ...state,
        cartStops: draft.stops,
        selectedValueTierId: draft.valueTierId || null,
        selectedLoadSizeId: draft.loadSizeId || null,
        waitMode: draft.waitMode,
        customerLocation: draft.customerLocation,
        sheetState: draft.stops.length > 0 ? 'cart' : 'idle',
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        sheetState: 'error',
        errorMessage: event.message,
        errorActionLabel: event.actionLabel || 'إعادة المحاولة',
      };
    }

    case 'CLEAR_ERROR': {
      return {
        ...state,
        sheetState: state.cartStops.length > 0 ? 'cart' : 'idle',
        errorMessage: null,
        errorActionLabel: null,
      };
    }

    case 'TOGGLE_CHAT': {
      return {
        ...state,
        isChatOpen: event.open !== undefined ? event.open : !state.isChatOpen,
      };
    }

    case 'RESET': {
      return {
        ...INITIAL_CUSTOMER_STATE,
        customerLocation: state.customerLocation,
      };
    }

    default:
      return state;
  }
}
