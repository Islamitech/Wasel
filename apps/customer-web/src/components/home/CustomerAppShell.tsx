import React, { useReducer, useEffect, useState, useRef, Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api.js';
import { customerReducer, INITIAL_CUSTOMER_STATE } from '../../machines/customerStateMachine.js';
import { Coordinates } from '../../types/customer.js';
import { Sheet } from '../ui/Sheet.js';

const MapContainer = lazy(() => import('../map/MapContainer.js').then((m) => ({ default: m.MapContainer })));
import { IdleSheet } from '../sheet/IdleSheet.js';
import { ActionMenuSheet } from '../sheet/ActionMenuSheet.js';
import { TaskDetailSheet } from '../sheet/TaskDetailSheet.js';
import { CartBar } from '../sheet/CartBar.js';
import { CartSheet } from '../sheet/CartSheet.js';
import { SearchingSheet } from '../sheet/SearchingSheet.js';
import { OffersSheet } from '../sheet/OffersSheet.js';
import { TrackingSheet } from '../sheet/TrackingSheet.js';
import { InvoiceSheet } from '../sheet/InvoiceSheet.js';
import { DoneSheet } from '../sheet/DoneSheet.js';
import { ChatModal } from '../sheet/ChatModal.js';
import { CancelOrderModal } from '../sheet/CancelOrderModal.js';
import { TopMenu } from './TopMenu.js';
import { getUiError } from '../../services/errors/errorTaxonomy.js';
import { loadDraft, saveDraft, clearDraft } from '../../services/storage/draftStorage.js';
import { PlaceDto, ServiceActionDto, ValueTierDto, VehicleTypeDto, OrderStatus } from '@wasel/api-client';

interface CustomerAppShellProps {
  user: any;
  onLogout: () => void;
}

export const CustomerAppShell: React.FC<CustomerAppShellProps> = ({ user, onLogout }) => {
  const [state, dispatch] = useReducer(customerReducer, INITIAL_CUSTOMER_STATE);
  const [driverLocation, setDriverLocation] = useState<Coordinates | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const quoteTimeoutRef = useRef<any>(null);
  const isDraftInitializedRef = useRef(false);

  // 1. Fetch Catalog (Unified)
  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiClient.catalog.getUnified(),
    staleTime: 1000 * 60 * 30, // 30 min
  });

  const serviceActions: ServiceActionDto[] = catalogData?.serviceActions || [
    { id: '11111111-1111-1111-1111-111111111111', code: 'buy', nameAr: 'شراء من هنا', sortOrder: 1 },
    { id: '22222222-2222-2222-2222-222222222222', code: 'pick', nameAr: 'استلام من هنا', sortOrder: 2 },
    { id: '33333333-3333-3333-3333-333333333333', code: 'drop', nameAr: 'توصيل هنا', sortOrder: 3 },
    { id: '44444444-4444-4444-4444-444444444444', code: 'move', nameAr: 'نقل من هنا', sortOrder: 4 },
  ];

  const valueTiers: ValueTierDto[] = catalogData?.valueTiers || [
    { id: 'v1', code: 'tier_1', nameAr: 'أقل من ٢٠٠ ج', minMinor: 0, maxMinor: 20000, rank: 1 },
    { id: 'v2', code: 'tier_2', nameAr: '٢٠٠ - ٥٠٠ ج', minMinor: 20000, maxMinor: 50000, rank: 2 },
    { id: 'v3', code: 'tier_3', nameAr: '٥٠٠ - ١٠٠٠ ج', minMinor: 50000, maxMinor: 100000, rank: 3 },
    { id: 'v4', code: 'tier_4', nameAr: '١٠٠٠ - ٥٠٠٠ ج', minMinor: 100000, maxMinor: 500000, rank: 4 },
    { id: 'v5', code: 'tier_5', nameAr: 'أكثر من ٥٠٠٠ ج', minMinor: 500000, maxMinor: null, rank: 5 },
  ];

  const vehicleTypes: VehicleTypeDto[] = catalogData?.vehicleTypes || [
    { id: 'vt1', code: 'bicycle', nameAr: 'دراجة' },
    { id: 'vt2', code: 'motorcycle', nameAr: 'موتوسيكل' },
    { id: 'vt3', code: 'tricycle', nameAr: 'تروسيكل' },
    { id: 'vt4', code: 'half_truck', nameAr: 'نص نقل' },
    { id: 'vt5', code: 'jumbo', nameAr: 'جامبو' },
  ];

  const maxTasks = catalogData?.settings?.maxTasksPerOrder || 8;

  // 2. Fetch Places around customer location
  const { data: placesData } = useQuery({
    queryKey: ['places', state.customerLocation.latitude, state.customerLocation.longitude],
    queryFn: () =>
      apiClient.catalog.searchPlaces({
        near: `${state.customerLocation.latitude},${state.customerLocation.longitude}`,
        radius: 3000,
        limit: 30,
      }),
    staleTime: 1000 * 60 * 10,
  });

  const places: PlaceDto[] = placesData || [
    {
      id: 'p-1',
      nameAr: 'سوبرماركت الفرجاني',
      latitude: 29.98,
      longitude: 31.12,
      category: 'grocery',
      isVerified: true,
      addressText: 'شارع الثروة المعدنية',
    },
    {
      id: 'p-2',
      nameAr: 'صيدلية العزبي',
      latitude: 29.976,
      longitude: 31.116,
      category: 'pharmacy',
      isVerified: true,
      addressText: 'بوابة خوفو الأولى',
    },
    {
      id: 'p-3',
      nameAr: 'مخبز الأهرام الآلي',
      latitude: 29.978,
      longitude: 31.118,
      category: 'bakery',
      isVerified: true,
      addressText: 'منطقة ح',
    },
  ];

  // 3. Resume Active Order on App Open, or load Draft from IndexedDB
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      // Check query param for testing / Lighthouse
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const requestedState = params?.get('state');

      if (requestedState === 'cart') {
        dispatch({
          type: 'RESTORE_DRAFT',
          draft: {
            stops: [
              {
                id: 'lh-stop-1',
                seq: 1,
                actionId: '11111111-1111-1111-1111-111111111111',
                actionCode: 'buy',
                actionNameAr: 'شراء من هنا',
                placeNameAr: 'سوبرماركت الفرجاني',
                location: { latitude: 29.98, longitude: 31.12 },
                description: 'مشتريات بقالة',
                expectedDurationMinutes: 15,
                invoiceRequired: true,
              },
            ],
            valueTierId: 'v1',
            waitMode: 'notify',
            customerLocation: { latitude: 29.98, longitude: 31.12 },
            updatedAt: Date.now(),
          },
        });
        isDraftInitializedRef.current = true;
        return;
      }

      if (requestedState === 'offers') {
        dispatch({
          type: 'ORDER_UPDATED',
          order: { id: 'ord-lh-offers', status: OrderStatus.OFFERS_RECEIVED } as any,
        });
        dispatch({
          type: 'OFFERS_RECEIVED',
          offers: [
            {
              id: 'off-lh-1',
              orderId: 'ord-lh-offers',
              driverId: 'drv-1',
              driverName: 'محمود كابتن',
              driverRating: 4.9,
              driverTripsCount: 150,
              vehicleClass: 'motorcycle',
              etaMinutes: 10,
              offeredFareMinor: 3000,
              status: 'pending',
            },
          ] as any,
        });
        isDraftInitializedRef.current = true;
        return;
      }

      try {
        // Check server for active published/agreed/in_progress orders
        const activeOrdersResponse = await apiClient.orders.list({ limit: 1 });
        const ordersList = activeOrdersResponse?.items || activeOrdersResponse || [];
        const activeRemote = ordersList.find(
          (o: any) =>
            o.status === OrderStatus.PUBLISHED ||
            o.status === OrderStatus.MATCHING ||
            o.status === OrderStatus.OFFERS_RECEIVED ||
            o.status === OrderStatus.AGREED ||
            o.status === OrderStatus.IN_PROGRESS,
        );

        if (activeRemote && isMounted) {
          // Fetch full order details
          const fullOrder = await apiClient.orders.get(activeRemote.id);
          let fullAgreement = null;
          if (fullOrder.agreement) {
            fullAgreement = fullOrder.agreement;
          } else if (fullOrder.status === OrderStatus.AGREED || fullOrder.status === OrderStatus.IN_PROGRESS) {
            try {
              // Try agreements list if applicable
            } catch {
              // Ignore
            }
          }

          dispatch({
            type: 'RESTORE_ORDER',
            order: fullOrder,
            agreement: fullAgreement,
            invoices: fullOrder.invoices || [],
          });
          isDraftInitializedRef.current = true;
          return;
        }

        // If no active remote order, restore draft from IndexedDB
        const localDraft = await loadDraft();
        if (localDraft && localDraft.stops && localDraft.stops.length > 0 && isMounted) {
          dispatch({ type: 'RESTORE_DRAFT', draft: localDraft });
        }
      } catch (err) {
        console.warn('Could not resume remote order:', err);
        const localDraft = await loadDraft();
        if (localDraft && localDraft.stops && localDraft.stops.length > 0 && isMounted) {
          dispatch({ type: 'RESTORE_DRAFT', draft: localDraft });
        }
      } finally {
        isDraftInitializedRef.current = true;
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // 4. Save draft to IndexedDB when cart stops or preferences change
  useEffect(() => {
    if (!isDraftInitializedRef.current) return;

    if (state.cartStops.length > 0 && !state.activeOrderId) {
      saveDraft({
        stops: state.cartStops,
        valueTierId: state.selectedValueTierId,
        loadSizeId: state.selectedLoadSizeId,
        waitMode: state.waitMode,
        customerLocation: state.customerLocation,
        updatedAt: Date.now(),
      });
    } else if (state.cartStops.length === 0 && !state.activeOrderId) {
      clearDraft();
    }
  }, [state.cartStops, state.selectedValueTierId, state.selectedLoadSizeId, state.waitMode, state.customerLocation, state.activeOrderId]);

  // 5. Calculate live debounced quote when in cart or stops change
  useEffect(() => {
    if (state.cartStops.length === 0) return;

    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
    }

    quoteTimeoutRef.current = setTimeout(async () => {
      try {
        if (state.activeOrderId) {
          const q = await apiClient.orders.getQuote(state.activeOrderId);
          dispatch({
            type: 'UPDATE_QUOTE',
            quote: {
              minFareMinor: q.minFareMinor,
              formattedFareEgp: q.breakdown?.formattedFareEgp || `${q.minFareMinor / 100} ج.م`,
              billableVisits: q.billableVisits,
              expectedWaitHours: q.expectedWaitHours,
              suggestedVehicleClasses: q.suggestedVehicleClasses || ['motorcycle'],
            },
          });
        } else {
          // Calculate client estimate based on API quote formula: visits * 10 + wait * 35 + 10% tier
          const visits = Math.max(1, state.cartStops.length);
          const selectedTier = valueTiers.find((t) => t.id === state.selectedValueTierId) || valueTiers[0];
          const tierMin = selectedTier ? ((selectedTier as any).minMinor ?? (selectedTier as any).minAmountMinor ?? 0) / 100 : 0;
          const waitHours = state.waitMode === 'wait' && state.cartStops.some((s) => s.actionCode === 'pick' || s.actionCode === 'drop') ? 1 : 0;
          const fareEgp = visits * 10 + waitHours * 35 + 0.1 * tierMin;
          const minFareMinor = Math.max(2000, Math.round(fareEgp * 100));

          dispatch({
            type: 'UPDATE_QUOTE',
            quote: {
              minFareMinor,
              formattedFareEgp: `${(minFareMinor / 100).toFixed(0)} ج.م`,
              billableVisits: visits,
              expectedWaitHours: waitHours,
              suggestedVehicleClasses: ['motorcycle', 'tricycle'],
            },
          });
        }
      } catch (err) {
        console.warn('Quote fetch error:', err);
      }
    }, 300);

    return () => {
      if (quoteTimeoutRef.current) clearTimeout(quoteTimeoutRef.current);
    };
  }, [state.cartStops, state.selectedValueTierId, state.waitMode, state.activeOrderId, valueTiers]);

  // 6. Realtime SSE Subscription
  useEffect(() => {
    const sub = apiClient.subscribeRealtime({
      onEvent: (event, data) => {
        console.log(`[SSE Event Received] ${event}`, data);

        if (event === 'order.updated') {
          dispatch({ type: 'ORDER_UPDATED', order: data });
          setStatusAnnouncement(`تحديث في الطلب: الحالة ${data.status}`);
        } else if (event === 'offer.created') {
          apiClient.offers.list(data.orderId || state.activeOrderId!).then((offers) => {
            dispatch({ type: 'OFFERS_RECEIVED', offers });
            setStatusAnnouncement(`تلقيت عرضاً جديداً من الكابتن`);
          });
        } else if (event === 'agreement.created') {
          dispatch({ type: 'AGREEMENT_CREATED', agreement: data });
          setStatusAnnouncement(`تم الاتفاق مع الكابتن وبدء المشوار`);
        } else if (event === 'driver.location') {
          if (data.location) {
            setDriverLocation({ latitude: data.location.latitude, longitude: data.location.longitude });
          }
        } else if (event === 'invoice.created') {
          dispatch({ type: 'INVOICE_ISSUED', invoice: data });
          setStatusAnnouncement(`أصدر الكابتن فاتورة مشتريات جديدة`);
        } else if (event === 'agreement.completed') {
          dispatch({ type: 'AGREEMENT_COMPLETED', agreement: data });
          setStatusAnnouncement(`اكتمل المشوار بنجاح`);
        }
      },
      onError: (err) => {
        console.warn('SSE stream notice:', err);
      },
    });

    return () => {
      sub.close();
    };
  }, [state.activeOrderId]);

  // Web Push Subscription Helper (prompted ONLY after first published order)
  const triggerWebPushSetup = async () => {
    const alreadyPrompted = localStorage.getItem('wasel_push_prompted');
    if (alreadyPrompted) return;

    localStorage.setItem('wasel_first_order_published', 'true');
    localStorage.setItem('wasel_push_prompted', 'true');

    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'fake_vapid_key_for_testing',
          });
          await apiClient.auth.registerDevice(JSON.stringify(sub));
        }
      } catch (e) {
        console.warn('Push registration notice:', e);
      }
    }
  };

  // 7. Handler: Publish Order
  const handlePublishOrder = async () => {
    if (state.cartStops.length === 0) return;
    setIsPublishing(true);

    try {
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `pub-${Date.now()}`;
      const defaultTier = valueTiers[0]?.id;

      // 1. Create order
      const createdOrder = await apiClient.orders.create(
        {
          regionId: catalogData?.regions?.[0]?.id,
          valueTierId: state.selectedValueTierId || defaultTier,
          waitMode: state.waitMode as any,
          customerLocation: state.customerLocation,
          stops: state.cartStops.map((s, idx) => ({
            seq: idx + 1,
            actionId: s.actionId,
            placeId: s.placeId || undefined,
            location: s.location,
            description: s.description || (s.isFindItForMe ? 'طلب بلا مكان - الكابتن يحدد المحل' : undefined),
            expectedDurationMinutes: s.expectedDurationMinutes || 15,
            invoiceRequired: s.invoiceRequired ?? false,
          })),
        },
        idempotencyKey,
      );

      // 2. Publish order
      const publishedOrder = await apiClient.orders.publish(createdOrder.id, idempotencyKey);

      // Clear local draft and set state
      await clearDraft();
      dispatch({ type: 'PUBLISH_ORDER_SUCCESS', order: publishedOrder });
      setStatusAnnouncement('تم نشر طلبك بنجاح، جاري البحث عن كابتن');

      // Trigger Web Push permission prompt after first order published
      triggerWebPushSetup();
    } catch (err: any) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsPublishing(false);
    }
  };

  // 8. Handler: Accept Offer
  const handleAcceptOffer = async (offerId: string) => {
    setIsProcessingAction(true);
    try {
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `acc-${Date.now()}`;
      const agreement = await apiClient.offers.accept(offerId, idempotencyKey);
      dispatch({ type: 'AGREEMENT_CREATED', agreement });
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 9. Handler: Counter Offer
  const handleCounterOffer = async (offerId: string, counterAmountMinor: number, notes?: string) => {
    setIsProcessingAction(true);
    try {
      await apiClient.offers.counter(offerId, { counterFareMinor: counterAmountMinor, notes });
      if (state.activeOrderId) {
        const freshOffers = await apiClient.offers.list(state.activeOrderId);
        dispatch({ type: 'OFFERS_RECEIVED', offers: freshOffers });
      }
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 10. Handler: Reject Offer
  const handleRejectOffer = async (offerId: string) => {
    setIsProcessingAction(true);
    try {
      await apiClient.offers.reject(offerId);
      if (state.activeOrderId) {
        const freshOffers = await apiClient.offers.list(state.activeOrderId);
        dispatch({ type: 'OFFERS_RECEIVED', offers: freshOffers });
      }
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 11. Handler: Confirm Payment Recorded for Invoice
  const handleConfirmPayment = async (invoiceId: string, amountMinor: number) => {
    setIsProcessingAction(true);
    try {
      await apiClient.agreements.recordPayment(invoiceId, {
        collectedAmountMinor: amountMinor,
        receiptType: 'cash',
        notes: 'تم تأكيد السداد نقداً',
      });
      dispatch({ type: 'INVOICE_CONFIRMED', invoiceId });
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 12. Handler: Dispute Invoice
  const handleDisputeInvoice = async (invoiceId: string, reason: string) => {
    setIsProcessingAction(true);
    try {
      await apiClient.agreements.disputeInvoice(invoiceId, { reason });
      alert('تم تسجيل اعتراضك وسيتواصل معك فريق الدعم للتحقق من الفاتورة.');
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 13. Handler: Cancel Order
  const handleCancelOrder = async (reason: string) => {
    if (!state.activeOrderId) return;
    setIsProcessingAction(true);
    try {
      await apiClient.orders.cancel(state.activeOrderId, { reason });
      dispatch({ type: 'ORDER_CANCELLED', reason });
    } catch (err) {
      const uiErr = getUiError(err);
      dispatch({ type: 'SET_ERROR', message: uiErr.arabicMessage, actionLabel: uiErr.recoveryActionLabel });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 14. Handler: Submit Rating
  const handleSubmitRating = async (score: number, comment: string) => {
    if (!state.activeAgreement?.id) return;
    setIsSubmittingRating(true);
    try {
      await apiClient.ratings.create(state.activeAgreement.id, { score, comment });
    } catch (err) {
      console.warn('Rating notice:', err);
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Check if order is currently being built: hide TopMenu
  const isBuildingOrder =
    state.sheetState === 'actionMenu' ||
    state.sheetState === 'taskDetail' ||
    state.sheetState === 'cart' ||
    state.cartStops.length > 0;

  return (
    <main
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-sheet, #ffffff)',
      }}
    >
      {/* Aria-live polite status announcer for screen readers */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>
        {statusAnnouncement}
      </div>

      {/* Top Menu Icon (Hidden when order is being built) */}
      <TopMenu user={user} onLogout={onLogout} visible={!isBuildingOrder} />

      {/* Map Layer */}
      <Suspense fallback={<div style={{ width: '100%', height: '100%', backgroundColor: '#eaf2ee' }} />}>
        <MapContainer
          customerLocation={state.customerLocation}
          onCustomerLocationChange={(coords) => dispatch({ type: 'SET_CUSTOMER_LOCATION', coords })}
          places={places}
          cartStops={state.cartStops}
          driverLocation={driverLocation}
          interactive={state.sheetState === 'idle' || state.sheetState === 'actionMenu'}
          onLongPress={(coords, nearestPlace, isNearCustomerPin) =>
            dispatch({ type: 'MAP_LONG_PRESS', coords, nearestPlace, isNearCustomerPin })
          }
          onPlaceClick={(place) => dispatch({ type: 'SELECT_PLACE', place })}
        />
      </Suspense>

      {/* Floating Persistent CartBar when stops >= 1 and sheet is closed/idle */}
      {state.sheetState === 'idle' && state.cartStops.length > 0 && (
        <CartBar
          stopsCount={state.cartStops.length}
          maxTasks={maxTasks}
          quote={state.quote}
          onOpenCart={() => dispatch({ type: 'OPEN_CART' })}
          onAddNoLocationStop={() => {
            const findAction: ServiceActionDto = serviceActions.find((a) => a.code === 'find') || serviceActions[0]!;
            dispatch({ type: 'ADD_NO_LOCATION_STOP', action: findAction });
          }}
        />
      )}

      {/* Persistent Bottom Sheet whose content changes by state */}
      <Sheet
        isOpen={state.sheetState !== 'idle'}
        onClose={() => {
          if (state.sheetState === 'actionMenu' || state.sheetState === 'taskDetail') {
            dispatch({ type: 'RESET' });
          } else if (state.sheetState === 'cart') {
            dispatch({ type: 'CLOSE_CART' });
          }
        }}
      >
        {state.sheetState === 'actionMenu' && state.selectedPoint && (
          <ActionMenuSheet
            selectedPoint={state.selectedPoint}
            serviceActions={serviceActions}
            onSelectAction={(action) => dispatch({ type: 'CHOOSE_ACTION', action })}
            onCancel={() => dispatch({ type: 'RESET' })}
          />
        )}

        {state.sheetState === 'taskDetail' && state.currentDraftStop && (
          <TaskDetailSheet
            draftStop={state.currentDraftStop}
            onUpdateDraft={(updates) => dispatch({ type: 'UPDATE_DRAFT_STOP', updates })}
            onAddAndContinue={() => dispatch({ type: 'ADD_STOP_AND_CONTINUE' })}
            onAddAndFinish={() => dispatch({ type: 'ADD_STOP_AND_FINISH' })}
            onCancel={() => dispatch({ type: 'RESET' })}
          />
        )}

        {state.sheetState === 'cart' && (
          <CartSheet
            stops={state.cartStops}
            valueTiers={valueTiers}
            vehicleTypes={vehicleTypes}
            selectedValueTierId={state.selectedValueTierId}
            waitMode={state.waitMode}
            quote={state.quote}
            isPublishing={isPublishing}
            onReorder={(from, to) => dispatch({ type: 'REORDER_STOPS', fromIndex: from, toIndex: to })}
            onDeleteStop={(stopId) => dispatch({ type: 'DELETE_STOP', stopId })}
            onSelectValueTier={(tierId) => dispatch({ type: 'SET_VALUE_TIER', tierId })}
            onToggleWaitMode={(waitMode) => dispatch({ type: 'SET_WAIT_MODE', waitMode })}
            onAddMoreStops={() => dispatch({ type: 'CLOSE_CART' })}
            onPublish={handlePublishOrder}
            onClose={() => dispatch({ type: 'CLOSE_CART' })}
          />
        )}

        {state.sheetState === 'searching' && (
          <SearchingSheet
            orderId={state.activeOrderId || ''}
            onCancelClick={() => setIsCancelModalOpen(true)}
          />
        )}

        {state.sheetState === 'offers' && (
          <OffersSheet
            offers={state.offers}
            onAccept={handleAcceptOffer}
            onReject={handleRejectOffer}
            onCounter={handleCounterOffer}
            isProcessing={isProcessingAction}
          />
        )}

        {state.sheetState === 'tracking' && state.activeOrder && state.activeAgreement && (
          <TrackingSheet
            order={state.activeOrder}
            agreement={state.activeAgreement}
            onApproveAmendment={(id) => apiClient.agreements.approveAmendment(id)}
            onRejectAmendment={(id) => apiClient.agreements.rejectAmendment(id)}
            onApproveInFlightStop={(id) => apiClient.agreements.arriveAtStop(state.activeAgreement!.id, id, { location: state.customerLocation })}
            onRejectInFlightStop={() => {}}
            onOpenChat={() => dispatch({ type: 'TOGGLE_CHAT', open: true })}
          />
        )}

        {state.sheetState === 'invoice' && (
          <InvoiceSheet
            invoices={state.invoices}
            onConfirmPayment={handleConfirmPayment}
            onDispute={handleDisputeInvoice}
            isProcessing={isProcessingAction}
          />
        )}

        {state.sheetState === 'done' && (
          <DoneSheet
            agreement={state.activeAgreement}
            invoices={state.invoices}
            onSubmitRating={handleSubmitRating}
            onNewOrder={() => dispatch({ type: 'RESET' })}
            isSubmittingRating={isSubmittingRating}
          />
        )}

        {state.sheetState === 'cancelled' && (
          <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>تم إلغاء الطلب</h3>
            <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>{state.errorMessage || 'تم إلغاء الطلب بنجاح.'}</p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
              style={{
                height: '52px',
                borderRadius: 'var(--radius-md, 18px)',
                backgroundColor: 'var(--color-ink, #12302b)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              بدء طلب جديد
            </button>
          </div>
        )}

        {state.sheetState === 'error' && (
          <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>تنبيه</h3>
            <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>{state.errorMessage}</p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
              style={{
                height: '52px',
                borderRadius: 'var(--radius-md, 18px)',
                backgroundColor: 'var(--color-ink, #12302b)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {state.errorActionLabel || 'حسناً'}
            </button>
          </div>
        )}
      </Sheet>

      {/* In idle state with 0 stops: persistent bottom panel with "ماذا تحتاج؟" */}
      {state.sheetState === 'idle' && state.cartStops.length === 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 900,
            backgroundColor: 'var(--color-sheet, #ffffff)',
            borderTopLeftRadius: 'var(--radius-lg, 24px)',
            borderTopRightRadius: 'var(--radius-lg, 24px)',
            padding: '16px 20px calc(16px + var(--safe-bottom, 0px)) 20px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          }}
        >
          <IdleSheet
            places={places}
            onSelectPlace={(place) => dispatch({ type: 'SELECT_PLACE', place })}
            onOpenActionMenu={() => {
              dispatch({
                type: 'MAP_LONG_PRESS',
                coords: state.customerLocation,
                isNearCustomerPin: true,
              });
            }}
          />
        </div>
      )}

      {/* In-app Chat Modal */}
      {state.isChatOpen && (
        <ChatModal
          isOpen={state.isChatOpen}
          onClose={() => dispatch({ type: 'TOGGLE_CHAT', open: false })}
          messages={state.messages}
          currentUserId={user.id}
          driverName={state.activeAgreement?.driverName || undefined}
          onSendMessage={async (text) => {
            if (!state.activeAgreement?.id) return;
            await apiClient.messaging.send(state.activeAgreement.id, { content: text });
          }}
        />
      )}

      {/* Cancel Order Modal */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirmCancel={async (reason) => {
          setIsCancelModalOpen(false);
          await handleCancelOrder(reason);
        }}
        isProcessing={isProcessingAction}
      />
    </main>
  );
};
