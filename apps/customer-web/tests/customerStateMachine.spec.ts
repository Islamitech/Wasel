import { describe, it, expect } from 'vitest';
import { customerReducer, INITIAL_CUSTOMER_STATE } from '../src/machines/customerStateMachine.js';
import { OrderStatus, AgreementStatus } from '@wasel/api-client';

describe('Customer State Machine Unit Tests', () => {
  it('initializes in idle state at default location', () => {
    expect(INITIAL_CUSTOMER_STATE.sheetState).toBe('idle');
    expect(INITIAL_CUSTOMER_STATE.cartStops).toHaveLength(0);
    expect(INITIAL_CUSTOMER_STATE.customerLocation.latitude).toBeCloseTo(29.975);
  });

  it('handles long-press near customer pin by setting pointType customer_pin', () => {
    const next = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'MAP_LONG_PRESS',
      coords: { latitude: 29.9751, longitude: 31.1151 },
      isNearCustomerPin: true,
    });

    expect(next.sheetState).toBe('actionMenu');
    expect(next.selectedPoint?.pointType).toBe('customer_pin');
    expect(next.selectedPoint?.addressLabel).toBe('موقعي الحالي');
  });

  it('handles long-press on shop POI by snapping to place coordinates', () => {
    const fakePlace = {
      id: 'place-123',
      nameAr: 'سوبرماركت الفرجاني',
      latitude: 29.98,
      longitude: 31.12,
      category: 'grocery',
      isVerified: true,
    };

    const next = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'MAP_LONG_PRESS',
      coords: { latitude: 29.9802, longitude: 31.1201 },
      nearestPlace: fakePlace,
    });

    expect(next.sheetState).toBe('actionMenu');
    expect(next.selectedPoint?.pointType).toBe('shop');
    expect(next.selectedPoint?.place?.id).toBe('place-123');
    expect(next.selectedPoint?.coordinates.latitude).toBe(29.98);
  });

  it('transitions from actionMenu to taskDetail on choosing an action', () => {
    const menuState = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'MAP_LONG_PRESS',
      coords: { latitude: 29.98, longitude: 31.12 },
    });

    const taskState = customerReducer(menuState, {
      type: 'CHOOSE_ACTION',
      action: {
        id: 'act-buy',
        code: 'buy',
        nameAr: 'شراء من هنا',
        sortOrder: 1,
      },
    });

    expect(taskState.sheetState).toBe('taskDetail');
    expect(taskState.currentDraftStop).toBeDefined();
    expect(taskState.currentDraftStop?.actionCode).toBe('buy');
    expect(taskState.currentDraftStop?.invoiceRequired).toBe(true);
  });

  it('adds stop and returns to idle when customer chooses "أضف مكاناً آخر"', () => {
    const menuState = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'MAP_LONG_PRESS',
      coords: { latitude: 29.98, longitude: 31.12 },
    });

    const taskState = customerReducer(menuState, {
      type: 'CHOOSE_ACTION',
      action: { id: 'act-buy', code: 'buy', nameAr: 'شراء' },
    });

    const withDescription = customerReducer(taskState, {
      type: 'UPDATE_DRAFT_STOP',
      updates: { description: 'شراء جبن وخبز' },
    });

    const finalState = customerReducer(withDescription, {
      type: 'ADD_STOP_AND_CONTINUE',
    });

    expect(finalState.sheetState).toBe('idle');
    expect(finalState.cartStops).toHaveLength(1);
    expect(finalState.cartStops[0].description).toBe('شراء جبن وخبز');
  });

  it('adds stop and transitions to cart when customer chooses "أكمل الطلب"', () => {
    const menuState = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'MAP_LONG_PRESS',
      coords: { latitude: 29.98, longitude: 31.12 },
    });

    const taskState = customerReducer(menuState, {
      type: 'CHOOSE_ACTION',
      action: { id: 'act-pick', code: 'pick', nameAr: 'استلام' },
    });

    const cartState = customerReducer(taskState, {
      type: 'ADD_STOP_AND_FINISH',
    });

    expect(cartState.sheetState).toBe('cart');
    expect(cartState.cartStops).toHaveLength(1);
  });

  it('handles "طلب بلا مكان" (find it for me)', () => {
    const next = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'ADD_NO_LOCATION_STOP',
      action: { id: 'act-find', code: 'find', nameAr: 'طلب بلا مكان' },
    });

    expect(next.sheetState).toBe('taskDetail');
    expect(next.currentDraftStop?.isFindItForMe).toBe(true);
    expect(next.currentDraftStop?.placeId).toBeNull();
  });

  it('reorders and deletes stops in cart', () => {
    let state = INITIAL_CUSTOMER_STATE;
    // Add two stops
    state = {
      ...state,
      cartStops: [
        {
          id: 'stop-1',
          seq: 1,
          actionId: 'a1',
          actionCode: 'buy',
          actionNameAr: 'شراء',
          location: { latitude: 29.98, longitude: 31.12 },
          description: 'محل 1',
        },
        {
          id: 'stop-2',
          seq: 2,
          actionId: 'a2',
          actionCode: 'drop',
          actionNameAr: 'توصيل',
          location: { latitude: 29.975, longitude: 31.115 },
          description: 'المنزل',
        },
      ],
      sheetState: 'cart',
    };

    // Reorder: move stop 0 to position 1
    const reordered = customerReducer(state, {
      type: 'REORDER_STOPS',
      fromIndex: 0,
      toIndex: 1,
    });
    expect(reordered.cartStops[0].id).toBe('stop-2');
    expect(reordered.cartStops[0].seq).toBe(1);
    expect(reordered.cartStops[1].id).toBe('stop-1');
    expect(reordered.cartStops[1].seq).toBe(2);

    // Delete stop-2
    const deleted = customerReducer(reordered, {
      type: 'DELETE_STOP',
      stopId: 'stop-2',
    });
    expect(deleted.cartStops).toHaveLength(1);
    expect(deleted.cartStops[0].id).toBe('stop-1');
    expect(deleted.cartStops[0].seq).toBe(1);
  });

  it('publishes order and enters searching state', () => {
    const publishedOrder: any = {
      id: 'order-999',
      status: OrderStatus.PUBLISHED,
      minFareMinor: 2600,
      customerLocation: { latitude: 29.975, longitude: 31.115 },
      stops: [],
    };

    const next = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'PUBLISH_ORDER_SUCCESS',
      order: publishedOrder,
    });

    expect(next.sheetState).toBe('searching');
    expect(next.activeOrderId).toBe('order-999');
  });

  it('transitions to tracking on agreement creation', () => {
    const agreement: any = {
      id: 'agr-123',
      orderId: 'order-999',
      driverId: 'drv-456',
      agreedFareMinor: 2600,
      status: AgreementStatus.ACTIVE,
    };

    const next = customerReducer(
      { ...INITIAL_CUSTOMER_STATE, sheetState: 'searching', activeOrderId: 'order-999' },
      { type: 'AGREEMENT_CREATED', agreement },
    );

    expect(next.sheetState).toBe('tracking');
    expect(next.activeAgreement?.id).toBe('agr-123');
  });

  it('transitions to invoice state when driver issues an invoice', () => {
    const invoice: any = {
      id: 'inv-1',
      orderId: 'order-999',
      amountMinor: 16000,
      verifiedByCustomer: false,
    };

    const next = customerReducer(
      { ...INITIAL_CUSTOMER_STATE, sheetState: 'tracking' },
      { type: 'INVOICE_ISSUED', invoice },
    );

    expect(next.sheetState).toBe('invoice');
    expect(next.invoices).toHaveLength(1);
    expect(next.invoices[0].id).toBe('inv-1');
  });

  it('returns to tracking once invoice is confirmed', () => {
    const invoice: any = {
      id: 'inv-1',
      orderId: 'order-999',
      amountMinor: 16000,
      verifiedByCustomer: false,
    };

    const stateWithInvoice = {
      ...INITIAL_CUSTOMER_STATE,
      sheetState: 'invoice' as const,
      invoices: [invoice],
    };

    const next = customerReducer(stateWithInvoice, {
      type: 'INVOICE_CONFIRMED',
      invoiceId: 'inv-1',
    });

    expect(next.sheetState).toBe('tracking');
    expect(next.invoices[0].verifiedByCustomer).toBe(true);
  });

  it('transitions to done state when agreement is completed', () => {
    const agreement: any = {
      id: 'agr-123',
      status: AgreementStatus.FULFILLED,
    };

    const next = customerReducer(
      { ...INITIAL_CUSTOMER_STATE, sheetState: 'tracking' },
      { type: 'AGREEMENT_COMPLETED', agreement },
    );

    expect(next.sheetState).toBe('done');
  });

  it('resumes active order correctly on app startup', () => {
    const order: any = {
      id: 'order-abc',
      status: OrderStatus.IN_PROGRESS,
    };
    const agreement: any = {
      id: 'agr-xyz',
      status: AgreementStatus.ACTIVE,
    };

    const resumed = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'RESTORE_ORDER',
      order,
      agreement,
    });

    expect(resumed.sheetState).toBe('tracking');
    expect(resumed.activeOrderId).toBe('order-abc');
  });

  it('handles error states and recovery clear', () => {
    const errState = customerReducer(INITIAL_CUSTOMER_STATE, {
      type: 'SET_ERROR',
      message: 'فشل الاتصال بالخادم',
      actionLabel: 'إعادة المحاولة',
    });

    expect(errState.sheetState).toBe('error');
    expect(errState.errorMessage).toBe('فشل الاتصال بالخادم');

    const cleared = customerReducer(errState, { type: 'CLEAR_ERROR' });
    expect(cleared.sheetState).toBe('idle');
    expect(cleared.errorMessage).toBeNull();
  });
});
