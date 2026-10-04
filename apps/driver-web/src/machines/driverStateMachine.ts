import {
  InvoiceResponseDto,
  UserDto,
} from '@wasel/api-client';
import {
  ActiveAgreementWithOrder,
  BiddingState,
  Coordinates,
  DriverAppState,
  DriverSheetState,
  DriverSubscriptionInfo,
  DriverVerificationInfo,
  IncomingOrderCard,
  RunStopPhase,
  SettlementBreakdown,
  ThemeMode,
  TodayEarnings,
} from '../types/driver.js';

export type DriverEvent =
  | { type: 'SET_USER'; user: UserDto | null }
  | { type: 'LOGOUT' }
  | { type: 'SET_VERIFICATION'; verification: DriverVerificationInfo }
  | { type: 'SET_SUBSCRIPTION'; subscription: DriverSubscriptionInfo }
  | { type: 'SET_DRIVER_LOCATION'; coords: Coordinates }
  | { type: 'GO_ONLINE' }
  | { type: 'GO_OFFLINE' }
  | { type: 'ORDER_BROADCAST_RECEIVED'; orderCard: IncomingOrderCard }
  | { type: 'DECLINE_ORDER' }
  | { type: 'ACCEPT_ORDER_SUCCESS'; agreement: ActiveAgreementWithOrder }
  | { type: 'OPEN_BIDDING' }
  | { type: 'UPDATE_BID_PRICE'; amountMinor: number }
  | { type: 'SUBMIT_BID_SUCCESS' }
  | { type: 'CUSTOMER_COUNTER_RECEIVED'; counterAmountMinor: number }
  | { type: 'CUSTOMER_ACCEPTED_OFFER'; agreement: ActiveAgreementWithOrder }
  | { type: 'OFFER_REJECTED'; reason?: string }
  | { type: 'ORDER_ALREADY_AGREED' }
  | { type: 'ARRIVE_AT_STOP' }
  | { type: 'START_WAIT' }
  | { type: 'END_WAIT' }
  | { type: 'OPEN_INVOICE_ENTRY' }
  | { type: 'CANCEL_INVOICE_ENTRY' }
  | { type: 'INVOICE_SUBMITTED'; invoice: InvoiceResponseDto }
  | { type: 'PAYMENT_CONFIRMED' }
  | { type: 'COMPLETE_CURRENT_STOP' }
  | { type: 'COMPLETE_AGREEMENT_SUCCESS'; settlement: SettlementBreakdown }
  | { type: 'CANCEL_AGREEMENT_SUCCESS' }
  | { type: 'AGREEMENT_CANCELLED_BY_CUSTOMER'; reason?: string }
  | { type: 'RESTORE_ACTIVE_JOB'; agreement: ActiveAgreementWithOrder; currentStopIndex: number; currentStopPhase: RunStopPhase; waitStartTime: number | null }
  | { type: 'FINISH_JOB_AND_WAIT' }
  | { type: 'FINISH_JOB_AND_OFFLINE' }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_ERROR'; message: string; actionLabel?: string; actionType?: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'TOGGLE_MENU'; open?: boolean }
  | { type: 'TOGGLE_CHAT'; open?: boolean }
  | { type: 'TOGGLE_CANCEL_MODAL'; open?: boolean }
  | { type: 'SET_WAKELOCK'; active: boolean }
  | { type: 'UPDATE_OFFLINE_QUEUE_COUNT'; count: number }
  | { type: 'UPDATE_TODAY_EARNINGS'; earnings: TodayEarnings };

export const INITIAL_DRIVER_STATE: DriverAppState = {
  sheetState: 'auth',
  theme: 'light',
  user: null,
  driverLocation: { latitude: 29.975, longitude: 31.115 },
  verification: null,
  subscription: null,
  incomingOrder: null,
  bidding: null,
  activeAgreement: null,
  currentStopIndex: 0,
  currentStopPhase: 'to_stop',
  waitStartTime: null,
  currentStopInvoice: null,
  pendingAmendments: [],
  settlement: null,
  todayEarnings: {
    completedTripsCount: 0,
    totalEarningsMinor: 0,
    formattedTotalEarnings: '0 ج.م',
  },
  offlineQueueCount: 0,
  isMenuOpen: false,
  isChatOpen: false,
  isCancelModalOpen: false,
  isWakeLockActive: false,
  errorMessage: null,
  errorActionLabel: null,
  errorActionType: null,
  onlineHeartbeatInterval: 5,
};

export function driverReducer(
  state: DriverAppState,
  event: DriverEvent,
): DriverAppState {
  switch (event.type) {
    case 'SET_USER': {
      if (!event.user) {
        return {
          ...state,
          sheetState: 'auth',
          user: null,
        };
      }

      // Check onboarding requirements
      const isProfileIncomplete = !event.user.fullName;
      const nextState: DriverSheetState = isProfileIncomplete
        ? 'onboarding'
        : state.sheetState === 'auth'
        ? 'off'
        : state.sheetState;

      return {
        ...state,
        user: event.user,
        sheetState: nextState,
      };
    }

    case 'LOGOUT': {
      return {
        ...INITIAL_DRIVER_STATE,
        theme: state.theme,
        sheetState: 'auth',
      };
    }

    case 'SET_VERIFICATION':
      return {
        ...state,
        verification: event.verification,
      };

    case 'SET_SUBSCRIPTION':
      return {
        ...state,
        subscription: event.subscription,
      };

    case 'SET_DRIVER_LOCATION':
      return {
        ...state,
        driverLocation: event.coords,
      };

    case 'GO_ONLINE': {
      // Guard: Cannot go online without active subscription or if suspended
      if (state.verification && state.verification.status === 'suspended') {
        return {
          ...state,
          errorMessage: 'حسابك معلق حالياً من قِبل إدارة المنصة. يرجى التواصل مع الدعم.',
          errorActionLabel: 'حسناً',
          errorActionType: 'dismiss',
        };
      }

      return {
        ...state,
        sheetState: 'waiting',
        errorMessage: null,
      };
    }

    case 'GO_OFFLINE': {
      return {
        ...state,
        sheetState: 'off',
        incomingOrder: null,
        bidding: null,
      };
    }

    case 'ORDER_BROADCAST_RECEIVED': {
      // Only transition to incoming if driver is currently waiting or bidding
      if (state.sheetState === 'waiting') {
        return {
          ...state,
          sheetState: 'incoming',
          incomingOrder: event.orderCard,
          errorMessage: null,
        };
      }
      return state;
    }

    case 'DECLINE_ORDER': {
      return {
        ...state,
        sheetState: 'waiting',
        incomingOrder: null,
        bidding: null,
      };
    }

    case 'ORDER_ALREADY_AGREED': {
      return {
        ...state,
        incomingOrder: null,
        bidding: null,
        sheetState: 'waiting',
        errorMessage: 'تم قبول هذا المشوار مسبقاً من كابتن آخر في سباق التنافس.',
        errorActionLabel: 'العودة لانتظار الطلبات',
        errorActionType: 'go_waiting',
      };
    }

    case 'ACCEPT_ORDER_SUCCESS': {
      return {
        ...state,
        sheetState: 'run',
        incomingOrder: null,
        bidding: null,
        activeAgreement: event.agreement,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
        errorMessage: null,
        isMenuOpen: false, // Ensure menu is closed during job
      };
    }

    case 'OPEN_BIDDING': {
      if (!state.incomingOrder) return state;
      const suggestedFare =
        state.incomingOrder.suggestedFareMinor || state.incomingOrder.minFareMinor;

      const bidding: BiddingState = {
        orderId: state.incomingOrder.orderId,
        suggestedFareMinor: suggestedFare,
        currentOfferMinor: suggestedFare,
        round: 1,
        maxRounds: 3,
        status: 'editing',
      };

      return {
        ...state,
        sheetState: 'bidding',
        bidding,
      };
    }

    case 'UPDATE_BID_PRICE': {
      if (!state.bidding) return state;
      return {
        ...state,
        bidding: {
          ...state.bidding,
          currentOfferMinor: Math.max(1000, event.amountMinor), // Min 10 EGP
        },
      };
    }

    case 'SUBMIT_BID_SUCCESS': {
      if (!state.bidding) return state;
      return {
        ...state,
        bidding: {
          ...state.bidding,
          status: 'sent_waiting',
        },
      };
    }

    case 'CUSTOMER_COUNTER_RECEIVED': {
      if (!state.bidding) return state;
      return {
        ...state,
        bidding: {
          ...state.bidding,
          customerCounterMinor: event.counterAmountMinor,
          currentOfferMinor: event.counterAmountMinor,
          round: state.bidding.round + 1,
          status: 'counter_received',
        },
      };
    }

    case 'CUSTOMER_ACCEPTED_OFFER': {
      return {
        ...state,
        sheetState: 'run',
        incomingOrder: null,
        bidding: null,
        activeAgreement: event.agreement,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
        isMenuOpen: false,
      };
    }

    case 'OFFER_REJECTED': {
      return {
        ...state,
        sheetState: 'waiting',
        incomingOrder: null,
        bidding: null,
        errorMessage: event.reason || 'تم رفض أو انتهاء مهلة العرض.',
        errorActionLabel: 'استقبال طلبات أخرى',
        errorActionType: 'go_waiting',
      };
    }

    // Run execution phases
    case 'ARRIVE_AT_STOP': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'at_stop',
      };
    }

    case 'START_WAIT': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'waiting',
        waitStartTime: Date.now(),
      };
    }

    case 'END_WAIT': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'at_stop',
        waitStartTime: null,
      };
    }

    case 'OPEN_INVOICE_ENTRY': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'invoice_entry',
      };
    }

    case 'CANCEL_INVOICE_ENTRY': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'at_stop',
      };
    }

    case 'INVOICE_SUBMITTED': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'payment_pending',
        currentStopInvoice: event.invoice,
      };
    }

    case 'PAYMENT_CONFIRMED': {
      if (state.sheetState !== 'run') return state;
      return {
        ...state,
        currentStopPhase: 'stop_completed',
      };
    }

    case 'COMPLETE_CURRENT_STOP': {
      if (state.sheetState !== 'run' || !state.activeAgreement) return state;
      const stops = state.activeAgreement.order?.stops || (state.activeAgreement.agreementSnapshot as any)?.stops || [];
      const isLastStop = state.currentStopIndex >= stops.length - 1;

      if (isLastStop) {
        return {
          ...state,
          currentStopPhase: 'stop_completed',
        };
      }

      return {
        ...state,
        currentStopIndex: state.currentStopIndex + 1,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
      };
    }

    case 'COMPLETE_AGREEMENT_SUCCESS': {
      const newCompletedCount = state.todayEarnings.completedTripsCount + 1;
      const newTotalMinor =
        state.todayEarnings.totalEarningsMinor + event.settlement.totalFareMinor;
      const formattedTotal = `${(newTotalMinor / 100).toFixed(0)} ج.م`;

      return {
        ...state,
        sheetState: 'done',
        settlement: event.settlement,
        todayEarnings: {
          completedTripsCount: newCompletedCount,
          totalEarningsMinor: newTotalMinor,
          formattedTotalEarnings: formattedTotal,
        },
      };
    }

    case 'CANCEL_AGREEMENT_SUCCESS': {
      return {
        ...state,
        sheetState: 'waiting',
        activeAgreement: null,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
        isCancelModalOpen: false,
      };
    }

    case 'AGREEMENT_CANCELLED_BY_CUSTOMER': {
      return {
        ...state,
        sheetState: 'waiting',
        activeAgreement: null,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
        isCancelModalOpen: false,
        errorMessage: event.reason || 'قام العميل بإلغاء المشوار.',
        errorActionLabel: 'العودة للانتظار',
        errorActionType: 'go_waiting',
      };
    }

    case 'RESTORE_ACTIVE_JOB': {
      return {
        ...state,
        sheetState: 'run',
        activeAgreement: event.agreement,
        currentStopIndex: event.currentStopIndex,
        currentStopPhase: event.currentStopPhase,
        waitStartTime: event.waitStartTime,
        isMenuOpen: false,
      };
    }

    case 'FINISH_JOB_AND_WAIT': {
      return {
        ...state,
        sheetState: 'waiting',
        activeAgreement: null,
        settlement: null,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
      };
    }

    case 'FINISH_JOB_AND_OFFLINE': {
      return {
        ...state,
        sheetState: 'off',
        activeAgreement: null,
        settlement: null,
        currentStopIndex: 0,
        currentStopPhase: 'to_stop',
        waitStartTime: null,
        currentStopInvoice: null,
      };
    }

    case 'SET_THEME':
      return {
        ...state,
        theme: event.theme,
      };

    case 'SET_ERROR':
      return {
        ...state,
        errorMessage: event.message,
        errorActionLabel: event.actionLabel || 'حسناً',
        errorActionType: event.actionType || 'dismiss',
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        errorMessage: null,
        errorActionLabel: null,
        errorActionType: null,
      };

    case 'TOGGLE_MENU':
      // Cannot open menu while a job is running!
      if (state.sheetState === 'run') {
        return { ...state, isMenuOpen: false };
      }
      return {
        ...state,
        isMenuOpen: event.open !== undefined ? event.open : !state.isMenuOpen,
      };

    case 'TOGGLE_CHAT':
      return {
        ...state,
        isChatOpen: event.open !== undefined ? event.open : !state.isChatOpen,
      };

    case 'TOGGLE_CANCEL_MODAL':
      return {
        ...state,
        isCancelModalOpen:
          event.open !== undefined ? event.open : !state.isCancelModalOpen,
      };

    case 'SET_WAKELOCK':
      return {
        ...state,
        isWakeLockActive: event.active,
      };

    case 'UPDATE_OFFLINE_QUEUE_COUNT':
      return {
        ...state,
        offlineQueueCount: event.count,
      };

    case 'UPDATE_TODAY_EARNINGS':
      return {
        ...state,
        todayEarnings: event.earnings,
      };

    default:
      return state;
  }
}
