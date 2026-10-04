import { describe, it, expect } from 'vitest';
import {
  driverReducer,
  INITIAL_DRIVER_STATE,
} from '../src/machines/driverStateMachine.js';
import { IncomingOrderCard } from '../src/types/driver.js';

describe('Driver State Machine (driverStateMachine)', () => {
  it('starts in auth state', () => {
    expect(INITIAL_DRIVER_STATE.sheetState).toBe('auth');
    expect(INITIAL_DRIVER_STATE.user).toBeNull();
  });

  it('transitions from auth to off when a complete user logs in', () => {
    const user = {
      id: 'usr-1',
      phone: '+201012345678',
      fullName: 'أحمد محمود',
      roles: ['driver'],
      createdAt: new Date().toISOString(),
    };

    const state = driverReducer(INITIAL_DRIVER_STATE, {
      type: 'SET_USER',
      user: user as any,
    });

    expect(state.sheetState).toBe('off');
    expect(state.user).toEqual(user);
  });

  it('transitions from auth to onboarding if user profile lacks fullName', () => {
    const incompleteUser = {
      id: 'usr-2',
      phone: '+201099998888',
      fullName: '',
      roles: ['driver'],
      createdAt: new Date().toISOString(),
    };

    const state = driverReducer(INITIAL_DRIVER_STATE, {
      type: 'SET_USER',
      user: incompleteUser as any,
    });

    expect(state.sheetState).toBe('onboarding');
  });

  it('transitions from off to waiting on GO_ONLINE', () => {
    const offState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'off' as const,
      user: { id: 'usr-1', phone: '+201012345678', fullName: 'أحمد' } as any,
    };

    const state = driverReducer(offState, { type: 'GO_ONLINE' });
    expect(state.sheetState).toBe('waiting');
  });

  it('blocks GO_ONLINE if driver is suspended', () => {
    const offState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'off' as const,
      user: { id: 'usr-1', phone: '+201012345678', fullName: 'أحمد' } as any,
      verification: {
        level: 1,
        status: 'suspended' as const,
        missingRequirements: [],
      },
    };

    const state = driverReducer(offState, { type: 'GO_ONLINE' });
    expect(state.sheetState).toBe('off');
    expect(state.errorMessage).toContain('معلق حالياً');
  });

  it('transitions from waiting to off on GO_OFFLINE', () => {
    const waitingState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'waiting' as const,
    };

    const state = driverReducer(waitingState, { type: 'GO_OFFLINE' });
    expect(state.sheetState).toBe('off');
  });

  it('receives an order broadcast and transitions to incoming', () => {
    const waitingState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'waiting' as const,
    };

    const orderCard: IncomingOrderCard = {
      orderId: 'ord-101',
      orderType: 'shopping',
      minFareMinor: 2600,
      distanceMeters: 450,
      billableVisits: 1,
      valueTierNameAr: 'أقل من 200 ج.م',
      loadSizeNameAr: 'صغير',
      waitMode: 'notify',
      stops: [
        {
          id: 'stp-1',
          seq: 1,
          actionCode: 'buy',
          actionNameAr: 'شراء بقالة',
          latitude: 29.98,
          longitude: 31.12,
          invoiceRequired: true,
        },
      ],
      expiresAt: new Date(Date.now() + 45000).toISOString(),
      rawOrder: { id: 'ord-101' } as any,
    };

    const state = driverReducer(waitingState, {
      type: 'ORDER_BROADCAST_RECEIVED',
      orderCard,
    });

    expect(state.sheetState).toBe('incoming');
    expect(state.incomingOrder?.orderId).toBe('ord-101');
    expect(state.incomingOrder?.minFareMinor).toBe(2600);
  });

  it('transitions from incoming back to waiting when order is declined', () => {
    const incomingState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'incoming' as const,
      incomingOrder: { orderId: 'ord-101' } as any,
    };

    const state = driverReducer(incomingState, { type: 'DECLINE_ORDER' });
    expect(state.sheetState).toBe('waiting');
    expect(state.incomingOrder).toBeNull();
  });

  it('handles ORDER_ALREADY_AGREED by returning to waiting with error message', () => {
    const incomingState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'incoming' as const,
      incomingOrder: { orderId: 'ord-101' } as any,
    };

    const state = driverReducer(incomingState, { type: 'ORDER_ALREADY_AGREED' });
    expect(state.sheetState).toBe('waiting');
    expect(state.errorMessage).toContain('تم قبول هذا المشوار مسبقاً من كابتن آخر');
  });

  it('transitions to run upon ACCEPT_ORDER_SUCCESS', () => {
    const incomingState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'incoming' as const,
      incomingOrder: { orderId: 'ord-101' } as any,
    };

    const agreement = {
      id: 'agr-1',
      orderId: 'ord-101',
      status: 'active',
      order: {
        id: 'ord-101',
        stops: [
          { id: 'stp-1', seq: 1, invoiceRequired: true },
          { id: 'stp-2', seq: 2, invoiceRequired: false },
        ],
      },
    };

    const state = driverReducer(incomingState, {
      type: 'ACCEPT_ORDER_SUCCESS',
      agreement: agreement as any,
    });

    expect(state.sheetState).toBe('run');
    expect(state.activeAgreement?.id).toBe('agr-1');
    expect(state.currentStopIndex).toBe(0);
    expect(state.currentStopPhase).toBe('to_stop');
    expect(state.isMenuOpen).toBe(false);
  });

  it('handles bidding lifecycle: open, update price, submit, and customer acceptance', () => {
    const incomingTransportState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'incoming' as const,
      incomingOrder: {
        orderId: 'ord-transport',
        orderType: 'moving' as const,
        minFareMinor: 5000,
        suggestedFareMinor: 8000,
      } as any,
    };

    // 1. Open bidding
    let state = driverReducer(incomingTransportState, { type: 'OPEN_BIDDING' });
    expect(state.sheetState).toBe('bidding');
    expect(state.bidding?.currentOfferMinor).toBe(8000);
    expect(state.bidding?.round).toBe(1);

    // 2. Adjust bid price (e.g. 9000 minor = 90 EGP)
    state = driverReducer(state, {
      type: 'UPDATE_BID_PRICE',
      amountMinor: 9000,
    });
    expect(state.bidding?.currentOfferMinor).toBe(9000);

    // 3. Submit bid
    state = driverReducer(state, { type: 'SUBMIT_BID_SUCCESS' });
    expect(state.bidding?.status).toBe('sent_waiting');

    // 4. Customer sends counter-offer of 8500
    state = driverReducer(state, {
      type: 'CUSTOMER_COUNTER_RECEIVED',
      counterAmountMinor: 8500,
    });
    expect(state.bidding?.customerCounterMinor).toBe(8500);
    expect(state.bidding?.currentOfferMinor).toBe(8500);
    expect(state.bidding?.round).toBe(2);

    // 5. Customer accepts
    const agreement = { id: 'agr-transport', orderId: 'ord-transport' };
    state = driverReducer(state, {
      type: 'CUSTOMER_ACCEPTED_OFFER',
      agreement: agreement as any,
    });
    expect(state.sheetState).toBe('run');
    expect(state.activeAgreement?.id).toBe('agr-transport');
  });

  it('progresses through run phases accurately for invoice and non-invoice stops', () => {
    let state = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'run' as const,
      activeAgreement: {
        id: 'agr-1',
        order: {
          stops: [
            { id: 'stp-1', seq: 1, invoiceRequired: true },
            { id: 'stp-2', seq: 2, invoiceRequired: false },
          ],
        },
      } as any,
      currentStopIndex: 0,
      currentStopPhase: 'to_stop' as const,
    };

    // Phase 1: Arrive
    state = driverReducer(state, { type: 'ARRIVE_AT_STOP' });
    expect(state.currentStopPhase).toBe('at_stop');

    // Phase 2: Wait start and end
    state = driverReducer(state, { type: 'START_WAIT' });
    expect(state.currentStopPhase).toBe('waiting');
    expect(state.waitStartTime).not.toBeNull();

    state = driverReducer(state, { type: 'END_WAIT' });
    expect(state.currentStopPhase).toBe('at_stop');
    expect(state.waitStartTime).toBeNull();

    // Phase 3: Invoice entry & submit
    state = driverReducer(state, { type: 'OPEN_INVOICE_ENTRY' });
    expect(state.currentStopPhase).toBe('invoice_entry');

    state = driverReducer(state, {
      type: 'INVOICE_SUBMITTED',
      invoice: { id: 'inv-1', amountMinor: 16000 } as any,
    });
    expect(state.currentStopPhase).toBe('payment_pending');
    expect(state.currentStopInvoice?.id).toBe('inv-1');

    // Phase 4: Payment confirmed
    state = driverReducer(state, { type: 'PAYMENT_CONFIRMED' });
    expect(state.currentStopPhase).toBe('stop_completed');

    // Phase 5: Complete stop -> advances to stop 2
    state = driverReducer(state, { type: 'COMPLETE_CURRENT_STOP' });
    expect(state.currentStopIndex).toBe(1);
    expect(state.currentStopPhase).toBe('to_stop');

    // Stop 2 (No invoice required - shorter path!)
    state = driverReducer(state, { type: 'ARRIVE_AT_STOP' });
    expect(state.currentStopPhase).toBe('at_stop');

    // Directly finish stop
    state = driverReducer(state, { type: 'PAYMENT_CONFIRMED' });
    expect(state.currentStopPhase).toBe('stop_completed');
  });

  it('completes agreement, computes settlement and today earnings, and transitions to done', () => {
    const runState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'run' as const,
      activeAgreement: { id: 'agr-1' } as any,
      todayEarnings: {
        completedTripsCount: 2,
        totalEarningsMinor: 5000,
        formattedTotalEarnings: '50 ج.م',
      },
    };

    const settlement = {
      visitsFeeMinor: 2000,
      waitFeeMinor: 7000,
      goodsCommissionMinor: 1000,
      invoicesTotalMinor: 10000,
      totalFareMinor: 10000,
      formattedTotalFare: '100 ج.م',
      currency: 'EGP',
    };

    const state = driverReducer(runState, {
      type: 'COMPLETE_AGREEMENT_SUCCESS',
      settlement,
    });

    expect(state.sheetState).toBe('done');
    expect(state.settlement?.totalFareMinor).toBe(10000);
    expect(state.todayEarnings.completedTripsCount).toBe(3);
    expect(state.todayEarnings.totalEarningsMinor).toBe(15000); // 5000 + 10000
    expect(state.todayEarnings.formattedTotalEarnings).toBe('150 ج.م');
  });

  it('prevents opening the drawer menu during a run state', () => {
    const runState = {
      ...INITIAL_DRIVER_STATE,
      sheetState: 'run' as const,
      isMenuOpen: false,
    };

    const state = driverReducer(runState, {
      type: 'TOGGLE_MENU',
      open: true,
    });

    expect(state.isMenuOpen).toBe(false);
  });
});
