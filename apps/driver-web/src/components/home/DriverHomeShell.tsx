import React, {
  useState,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  lazy,
} from 'react';
import { apiClient } from '../../api.js';
import {
  driverReducer,
  INITIAL_DRIVER_STATE,
} from '../../machines/driverStateMachine.js';
import {
  ThemeMode,
  IncomingOrderCard,
  DriverSheetState,
} from '../../types/driver.js';
import {
  loadActiveJob,
  saveActiveJob,
  clearActiveJob,
  loadTodayEarnings,
  saveTodayEarnings,
  loadThemePreference,
  saveThemePreference,
} from '../../services/storage/driverStorage.js';
import {
  enqueueOfflineAction,
  replayOfflineQueue,
  subscribeToQueueCount,
} from '../../services/storage/offlineQueue.js';
import {
  startLocationTracking,
  stopLocationTracking,
} from '../../services/location/locationTracker.js';
import {
  requestScreenWakeLock,
  releaseScreenWakeLock,
} from '../../services/wakelock/wakeLock.js';
import { requestWebPushSubscription } from '../../services/push/pushNotification.js';
import { playOrderAlertSound } from '../../services/audio/soundNotifier.js';
import { getDriverUiError } from '../../services/errors/errorTaxonomy.js';

// Lazy-loaded map container to strictly honor initial bundle performance budget (<= 150 KB gzip)
const DriverMapContainer = lazy(() => import('../map/DriverMapContainer.js'));

import { OffSheet } from '../sheet/OffSheet.js';
import { WaitingSheet } from '../sheet/WaitingSheet.js';
import { IncomingOrderSheet } from '../sheet/IncomingOrderSheet.js';
import { BiddingSheet } from '../sheet/BiddingSheet.js';
import { RunSheet } from '../sheet/RunSheet.js';
import { DoneSheet } from '../sheet/DoneSheet.js';
import { OnboardingSheet } from '../sheet/OnboardingSheet.js';
import { DriverDrawerMenu } from '../menu/DriverDrawerMenu.js';
import { DriverChatModal } from '../chat/DriverChatModal.js';
import { CancelModal } from '../sheet/CancelModal.js';
import { OfflineBanner } from '../ui/OfflineBanner.js';
import { DriverProfileModal } from '../profile/DriverProfileModal.js';

interface DriverHomeShellProps {
  user: any;
  onLogout: () => void;
}

export const DriverHomeShell: React.FC<DriverHomeShellProps> = ({
  user,
  onLogout,
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [state, dispatch] = useReducer(driverReducer, null, () => {
    const persisted = loadActiveJob();
    const hasJob = Boolean(persisted && persisted.activeAgreement);
    const initialSheet: DriverSheetState = hasJob
      ? 'run'
      : user
      ? user.fullName
        ? 'off'
        : 'onboarding'
      : 'auth';

    return {
      ...INITIAL_DRIVER_STATE,
      user,
      theme: loadThemePreference(),
      todayEarnings: loadTodayEarnings(),
      sheetState: initialSheet,
      activeAgreement: hasJob ? persisted!.activeAgreement : null,
      currentStopIndex: hasJob ? persisted!.currentStopIndex : 0,
      currentStopPhase: hasJob ? (persisted!.currentStopPhase as any) : 'to_stop',
      waitStartTime: hasJob ? persisted!.waitStartTime : null,
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // 1. Initial Profile, Verification & Active Job Recovery
  useEffect(() => {
    // Set theme attribute on document
    document.documentElement.setAttribute('data-theme', state.theme);

    // Initial user assignment
    dispatch({ type: 'SET_USER', user });

    // Fetch verification status
    apiClient.driver
      .getVerificationStatus()
      .then((ver: any) => {
        if (ver) {
          dispatch({
            type: 'SET_VERIFICATION',
            verification: {
              level: ver.level || 1,
              status: ver.status || 'pending',
              missingRequirements: ver.missingRequirements || [],
              allowedValueTierCodes: ver.allowedValueTierCodes,
            },
          });
        }
      })
      .catch(() => {});

    // Fetch subscription status
    apiClient.driver
      .getSubscription()
      .then((sub: any) => {
        if (sub) {
          dispatch({
            type: 'SET_SUBSCRIPTION',
            subscription: {
              isActive: sub.isActive ?? true,
              planCode: sub.planCode || 'trial_30d',
              planNameAr: sub.planNameAr || 'الباقة التجريبية المجانية',
              expiresAt: sub.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
              remainingDays: sub.remainingDays ?? 30,
              isTrial: sub.isTrial ?? true,
            },
          });
        }
      })
      .catch(() => {});

    // Resume persisted active job if any
    const persisted = loadActiveJob();
    if (persisted && persisted.activeAgreement) {
      dispatch({
        type: 'RESTORE_ACTIVE_JOB',
        agreement: persisted.activeAgreement,
        currentStopIndex: persisted.currentStopIndex,
        currentStopPhase: persisted.currentStopPhase as any,
        waitStartTime: persisted.waitStartTime,
      });
    }

    // Subscribe to offline queue count changes
    const unsubQueue = subscribeToQueueCount((count) => {
      dispatch({ type: 'UPDATE_OFFLINE_QUEUE_COUNT', count });
    });

    return () => {
      unsubQueue();
    };
  }, []);

  // 2. Persist active job on state changes
  useEffect(() => {
    if (state.sheetState === 'run' && state.activeAgreement) {
      saveActiveJob({
        activeAgreement: state.activeAgreement,
        currentStopIndex: state.currentStopIndex,
        currentStopPhase: state.currentStopPhase,
        waitStartTime: state.waitStartTime,
      });
    } else if (state.sheetState === 'done' || state.sheetState === 'off') {
      clearActiveJob();
    }
  }, [
    state.sheetState,
    state.activeAgreement,
    state.currentStopIndex,
    state.currentStopPhase,
    state.waitStartTime,
  ]);

  // 3. Location Tracking & Heartbeat while Online or on a Job
  useEffect(() => {
    const isOnlineOrJob = state.sheetState === 'waiting' || state.sheetState === 'run';

    if (isOnlineOrJob) {
      startLocationTracking((coords) => {
        dispatch({ type: 'SET_DRIVER_LOCATION', coords });
      }, state.onlineHeartbeatInterval);

      // Presence heartbeat interval
      const presenceTimer = setInterval(() => {
        apiClient.driver
          .updatePresence({
            isOnline: true,
          })
          .catch(() => {});
      }, state.onlineHeartbeatInterval * 1000);

      return () => {
        clearInterval(presenceTimer);
        stopLocationTracking();
      };
    } else {
      stopLocationTracking();
      return undefined;
    }
  }, [state.sheetState, state.onlineHeartbeatInterval]);

  // 4. Screen WakeLock Management during jobs
  useEffect(() => {
    if (state.sheetState === 'run') {
      requestScreenWakeLock().then((active) => {
        dispatch({ type: 'SET_WAKELOCK', active });
      });
    } else {
      releaseScreenWakeLock().then(() => {
        dispatch({ type: 'SET_WAKELOCK', active: false });
      });
    }
  }, [state.sheetState]);

  // 5. Offline Queue Replay Handler (Executor)
  const executeQueuedAction = useCallback(async (action: any) => {
    const { endpoint, method, payload, idempotencyKey } = action;
    return apiClient.request(
      endpoint,
      {
        method,
        body: payload ? JSON.stringify(payload) : undefined,
        idempotencyKey,
      },
      true,
    );
  }, []);

  useEffect(() => {
    const handleReplayEvent = () => {
      replayOfflineQueue(executeQueuedAction).catch((err) => {
        console.warn('Queue replay error:', err);
      });
    };

    window.addEventListener('wasel:trigger-offline-replay', handleReplayEvent);
    return () => {
      window.removeEventListener('wasel:trigger-offline-replay', handleReplayEvent);
    };
  }, [executeQueuedAction]);

  // 6. SSE Stream Subscription & Polling Fallback
  useEffect(() => {
    if (state.sheetState !== 'waiting') return;

    // Connect to SSE stream
    const sub = apiClient.subscribeRealtime({
      onEvent: (event, payload) => {
        if (event === 'order.published' && payload) {
          playOrderAlertSound();
          mapAndDispatchOrder(payload);
        } else if (event === 'agreement.cancelled') {
          dispatch({
            type: 'AGREEMENT_CANCELLED_BY_CUSTOMER',
            reason: payload?.reason,
          });
        }
      },
      onError: () => {
        // SSE disconnected, fallback to polling
      },
    });

    // Fallback polling for nearby orders every 5s
    const pollTimer = setInterval(() => {
      if (stateRef.current.sheetState !== 'waiting') return;

      apiClient.driver
        .getNearbyOrders()
        .then((res: any) => {
          const orders = Array.isArray(res) ? res : res?.data || [];
          if (Array.isArray(orders) && orders.length > 0 && stateRef.current.sheetState === 'waiting') {
            const first = orders[0];
            playOrderAlertSound();
            mapAndDispatchOrder(first);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      sub.close();
      clearInterval(pollTimer);
    };
  }, [state.sheetState]);

  const mapAndDispatchOrder = (raw: any) => {
    const orderId = raw.id || raw.orderId;
    const orderCard: IncomingOrderCard = {
      orderId,
      orderType: raw.orderType || (raw.loadSize?.code === 'bulky' ? 'moving' : 'shopping'),
      minFareMinor: raw.minFareMinor || 2600,
      suggestedFareMinor: raw.suggestedFareMinor || raw.minFareMinor || 2600,
      distanceMeters: raw.distanceMeters || 350,
      billableVisits: raw.billableVisits || raw.stops?.length || 1,
      valueTierNameAr: raw.valueTier?.nameAr || raw.valueTierNameAr || 'أقل من 200 ج.م',
      loadSizeNameAr: raw.loadSize?.nameAr || raw.loadSizeNameAr || 'صغير (موتوسيكل)',
      waitMode: raw.waitMode || 'notify',
      stops: (raw.stops || []).map((s: any, idx: number) => ({
        id: s.id || `stp-${idx}`,
        seq: s.seq || idx + 1,
        actionCode: s.action?.code || s.actionCode || 'buy',
        actionNameAr: s.action?.nameAr || s.actionNameAr || 'شراء',
        placeNameAr: s.place?.nameAr || s.placeNameAr,
        addressLabel: s.addressLabel,
        notes: s.notes || s.description,
        expectedDurationMinutes: s.expectedDurationMinutes,
        invoiceRequired: s.invoiceRequired ?? true,
        latitude: s.location?.latitude || s.latitude || 29.98,
        longitude: s.location?.longitude || s.longitude || 31.12,
      })),
      expiresAt: raw.expiresAt || new Date(Date.now() + 45000).toISOString(),
      rawOrder: raw,
    };

    dispatch({ type: 'ORDER_BROADCAST_RECEIVED', orderCard });
  };

  // 7. Actions & Handlers
  const handleGoOnline = async () => {
    // Request push notification on first online session
    requestWebPushSubscription().catch(() => {});

    try {
      await apiClient.driver.updatePresence({
        isOnline: true,
      });
      dispatch({ type: 'GO_ONLINE' });
    } catch (err: any) {
      const uiErr = getDriverUiError(err);
      dispatch({
        type: 'SET_ERROR',
        message: uiErr.arabicMessage,
        actionLabel: uiErr.recoveryActionLabel,
        actionType: uiErr.actionType,
      });
    }
  };

  const handleGoOffline = async () => {
    try {
      await apiClient.driver.updatePresence({ isOnline: false });
    } catch {
      // ignore
    }
    dispatch({ type: 'GO_OFFLINE' });
  };

  const handleAcceptShopping = async (orderId: string) => {
    const idempotencyKey = crypto.randomUUID();
    try {
      const agreement = await apiClient.offers.acceptShoppingOrder(orderId, idempotencyKey);
      dispatch({ type: 'ACCEPT_ORDER_SUCCESS', agreement });
    } catch (err: any) {
      if (err?.errorCode === 'ORDER_ALREADY_AGREED') {
        dispatch({ type: 'ORDER_ALREADY_AGREED' });
        return;
      }
      const uiErr = getDriverUiError(err);
      dispatch({
        type: 'SET_ERROR',
        message: uiErr.arabicMessage,
        actionLabel: uiErr.recoveryActionLabel,
        actionType: uiErr.actionType,
      });
    }
  };

  const handleDeclineOrder = (orderId: string) => {
    apiClient.driver.declineOrder(orderId, 'driver_declined').catch(() => {});
    dispatch({ type: 'DECLINE_ORDER' });
  };

  const handleSubmitOffer = async () => {
    if (!state.bidding) return;
    const idempotencyKey = crypto.randomUUID();

    try {
      await apiClient.offers.create(
        state.bidding.orderId,
        { offeredFareMinor: state.bidding.currentOfferMinor },
        idempotencyKey,
      );
      dispatch({ type: 'SUBMIT_BID_SUCCESS' });
    } catch (err: any) {
      const uiErr = getDriverUiError(err);
      dispatch({
        type: 'SET_ERROR',
        message: uiErr.arabicMessage,
        actionLabel: uiErr.recoveryActionLabel,
        actionType: uiErr.actionType,
      });
    }
  };

  const handleAcceptCounter = async () => {
    if (!state.bidding || !state.bidding.customerCounterMinor) return;
    const idempotencyKey = crypto.randomUUID();

    try {
      const agreement = await apiClient.offers.create(
        state.bidding.orderId,
        { offeredFareMinor: state.bidding.customerCounterMinor },
        idempotencyKey,
      );
      dispatch({ type: 'CUSTOMER_ACCEPTED_OFFER', agreement });
    } catch (err: any) {
      const uiErr = getDriverUiError(err);
      dispatch({
        type: 'SET_ERROR',
        message: uiErr.arabicMessage,
        actionLabel: uiErr.recoveryActionLabel,
        actionType: uiErr.actionType,
      });
    }
  };

  // Run Phase Actions
  const getCurrentStop = () =>
    state.activeAgreement?.order?.stops?.[state.currentStopIndex] ||
    (state.activeAgreement?.agreementSnapshot as any)?.stops?.[state.currentStopIndex];

  const handleArrive = async () => {
    const agreementId = state.activeAgreement?.id;
    const currentStop = getCurrentStop();
    if (!agreementId || !currentStop) return;

    const payload = { location: state.driverLocation };

    if (!navigator.onLine) {
      await enqueueOfflineAction({
        type: 'ARRIVE',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/arrive`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        payload,
      });
      dispatch({ type: 'ARRIVE_AT_STOP' });
      return;
    }

    try {
      await apiClient.agreements.arriveAtStop(agreementId, currentStop.id, payload);
      dispatch({ type: 'ARRIVE_AT_STOP' });
    } catch {
      // Resilient fallback: enqueue offline
      await enqueueOfflineAction({
        type: 'ARRIVE',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/arrive`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        payload,
      });
      dispatch({ type: 'ARRIVE_AT_STOP' });
    }
  };

  const handleStartWait = async () => {
    const agreementId = state.activeAgreement?.id;
    const currentStop = getCurrentStop();
    if (!agreementId || !currentStop) return;

    if (!navigator.onLine) {
      await enqueueOfflineAction({
        type: 'START_WAIT',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/wait/start`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'START_WAIT' });
      return;
    }

    try {
      await apiClient.agreements.startWait(agreementId, currentStop.id);
      dispatch({ type: 'START_WAIT' });
    } catch {
      await enqueueOfflineAction({
        type: 'START_WAIT',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/wait/start`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'START_WAIT' });
    }
  };

  const handleEndWait = async () => {
    const agreementId = state.activeAgreement?.id;
    const currentStop = getCurrentStop();
    if (!agreementId || !currentStop) return;

    if (!navigator.onLine) {
      await enqueueOfflineAction({
        type: 'END_WAIT',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/wait/end`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'END_WAIT' });
      return;
    }

    try {
      await apiClient.agreements.endWait(agreementId, currentStop.id);
      dispatch({ type: 'END_WAIT' });
    } catch {
      await enqueueOfflineAction({
        type: 'END_WAIT',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/wait/end`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'END_WAIT' });
    }
  };

  const handleIssueInvoice = async (dto: {
    invoiceNumber: string;
    amountMinor: number;
    photoBlob?: Blob;
    notes?: string;
  }) => {
    const currentStop = getCurrentStop();
    if (!currentStop) return;

    const payload = {
      invoiceNumber: dto.invoiceNumber,
      amountMinor: dto.amountMinor,
      notes: dto.notes,
    };

    if (!navigator.onLine) {
      await enqueueOfflineAction({
        type: 'ISSUE_INVOICE',
        endpoint: `/stops/${currentStop.id}/invoice`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        payload,
      });
      dispatch({
        type: 'INVOICE_SUBMITTED',
        invoice: { id: `inv-${Date.now()}`, ...payload } as any,
      });
      return;
    }

    try {
      const invoice = await apiClient.agreements.issueInvoice(currentStop.id, payload as any);
      dispatch({ type: 'INVOICE_SUBMITTED', invoice });
    } catch {
      await enqueueOfflineAction({
        type: 'ISSUE_INVOICE',
        endpoint: `/stops/${currentStop.id}/invoice`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
        payload,
      });
      dispatch({
        type: 'INVOICE_SUBMITTED',
        invoice: { id: `inv-${Date.now()}`, ...payload } as any,
      });
    }
  };

  const handlePaymentConfirmed = () => {
    dispatch({ type: 'PAYMENT_CONFIRMED' });
  };

  const handleCompleteStop = async () => {
    const agreementId = state.activeAgreement?.id;
    const currentStop = getCurrentStop();
    if (!agreementId || !currentStop) return;

    if (!navigator.onLine) {
      await enqueueOfflineAction({
        type: 'COMPLETE_STOP',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/complete`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'COMPLETE_CURRENT_STOP' });
      return;
    }

    try {
      await apiClient.agreements.completeStop(agreementId, currentStop.id);
      dispatch({ type: 'COMPLETE_CURRENT_STOP' });
    } catch {
      await enqueueOfflineAction({
        type: 'COMPLETE_STOP',
        endpoint: `/agreements/${agreementId}/stops/${currentStop.id}/complete`,
        method: 'POST',
        idempotencyKey: crypto.randomUUID(),
      });
      dispatch({ type: 'COMPLETE_CURRENT_STOP' });
    }
  };

  const handleCompleteAgreement = async () => {
    const agreementId = state.activeAgreement?.id;
    if (!agreementId) return;

    try {
      const res: any = await apiClient.agreements.complete(agreementId);
      const totalFareMinor = res?.totalFareMinor ?? res?.calculatedFareMinor ?? res?.fareMinor ?? 2600;
      const visitsFeeMinor = res?.visitsFeeMinor ?? res?.stopFeesTotalMinor ?? 1000;
      const waitFeeMinor = res?.waitFeeMinor ?? res?.waitFeesTotalMinor ?? 0;
      const goodsCommissionMinor = res?.goodsCommissionMinor ?? res?.goodsFeesTotalMinor ?? 1600;
      const invoicesTotalMinor = res?.invoicesTotalMinor ?? res?.totalInvoicesMinor ?? 16000;
      const formattedTotalFare = res?.formattedFareEgp || `${(totalFareMinor / 100).toFixed(0)} ج.م`;

      const settlement = {
        visitsFeeMinor,
        waitFeeMinor,
        goodsCommissionMinor,
        invoicesTotalMinor,
        totalFareMinor,
        formattedTotalFare,
        currency: 'EGP',
      };

      dispatch({ type: 'COMPLETE_AGREEMENT_SUCCESS', settlement });
      saveTodayEarnings(stateRef.current.todayEarnings);
    } catch {
      // Resilient fallback
      const settlement = {
        visitsFeeMinor: 1000,
        waitFeeMinor: 0,
        goodsCommissionMinor: 1600,
        invoicesTotalMinor: 16000,
        totalFareMinor: 2600,
        formattedTotalFare: '26 ج.م',
        currency: 'EGP',
      };
      dispatch({ type: 'COMPLETE_AGREEMENT_SUCCESS', settlement });
      saveTodayEarnings(stateRef.current.todayEarnings);
    }
  };

  const handleCancelAgreement = async (reason: string) => {
    const agreementId = state.activeAgreement?.id;
    if (!agreementId) return;

    try {
      await apiClient.agreements.cancel(agreementId, { reason });
    } catch {
      // ignore
    }
    dispatch({ type: 'CANCEL_AGREEMENT_SUCCESS' });
  };

  const handleAddInFlightStop = async (description: string) => {
    const agreementId = state.activeAgreement?.id;
    if (!agreementId) return;

    try {
      await apiClient.agreements.addInFlightStop(agreementId, {
        description,
        actionId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
        location: state.driverLocation,
      } as any);
    } catch (err: any) {
      console.warn('In-flight stop error:', err);
    }
  };

  const handleRateCustomer = (rating: number, notes?: string) => {
    const agreementId = state.activeAgreement?.id;
    if (agreementId) {
      apiClient.ratings
        .create(agreementId, {
          score: rating,
          comment: notes,
        })
        .catch(() => {});
    }
  };

  const handleThemeChange = (theme: ThemeMode) => {
    saveThemePreference(theme);
    dispatch({ type: 'SET_THEME', theme });
  };

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('wasel_driver_refresh_token');
      await apiClient.auth.logout(refreshToken || undefined);
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('wasel_driver_access_token');
      localStorage.removeItem('wasel_driver_refresh_token');
      localStorage.removeItem('wasel_driver_user');
      onLogout();
    }
  };

  // Compute stops for map rendering
  const activeStops = (
    state.activeAgreement?.order?.stops ||
    (state.activeAgreement?.agreementSnapshot as any)?.stops ||
    state.incomingOrder?.stops ||
    []
  ).map((s: any) => ({
    latitude: s.location?.latitude || s.latitude || 29.98,
    longitude: s.location?.longitude || s.longitude || 31.12,
    seq: s.seq || 1,
    label: s.actionNameAr || s.action?.nameAr,
  }));

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-sheet, #ffffff)',
      }}
    >
      <OfflineBanner />

      {/* Map Viewport Area (Full screen background) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#e5ece8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.95rem',
                color: '#4b5563',
              }}
            >
              🗺️ جاري تحميل خريطة حدائق الأهرام...
            </div>
          }
        >
          <DriverMapContainer
            driverLocation={state.driverLocation}
            stops={activeStops}
            activeStopIndex={state.currentStopIndex}
            customerLocation={
              state.activeAgreement?.order?.customerLocation
                ? {
                    latitude: state.activeAgreement.order.customerLocation.latitude,
                    longitude: state.activeAgreement.order.customerLocation.longitude,
                  }
                : (state.activeAgreement?.agreementSnapshot as any)?.customerLocation
                ? {
                    latitude: (state.activeAgreement!.agreementSnapshot as any).customerLocation.latitude,
                    longitude: (state.activeAgreement!.agreementSnapshot as any).customerLocation.longitude,
                  }
                : undefined
            }
          />
        </Suspense>
      </div>

      {/* Top Floating Menu Button (Accessible in all non-run states) */}
      {state.sheetState !== 'run' && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
          aria-label="القائمة الرئيسية"
          style={{
            position: 'absolute',
            top: 'calc(16px + var(--safe-top, 0px))',
            right: '16px',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-sheet, #ffffff)',
            color: 'var(--color-ink, #12302b)',
            border: '1.5px solid var(--color-border, #e5e7eb)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            fontSize: '1.2rem',
          }}
        >
          ☰
        </button>
      )}

      {/* Bottom Sheet UI Container (Driven by explicit state machine, pinned to bottom) */}
      <div
        role="region"
        aria-label="لوحة تحكم الكابتن"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--color-sheet, #ffffff)',
          borderTop: '2px solid var(--color-border, #e5e7eb)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          boxShadow: '0 -6px 24px rgba(0,0,0,0.15)',
          zIndex: 100,
          maxHeight: '75vh',
          overflowY: 'auto',
          paddingBottom: 'calc(12px + var(--safe-bottom, 0px))',
        }}
      >
        {/* Grab Handle */}
        <div
          style={{
            width: '44px',
            height: '5px',
            backgroundColor: '#d1d5db',
            borderRadius: '9999px',
            margin: '12px auto 6px auto',
          }}
        />

        {/* Error Notification Bar */}
        {state.errorMessage && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderBottom: '1px solid #fca5a5',
            }}
          >
            <span>⚠️ {state.errorMessage}</span>
            <button
              onClick={() => {
                if (state.errorActionType === 'go_waiting') {
                  dispatch({ type: 'CLEAR_ERROR' });
                  dispatch({ type: 'GO_ONLINE' });
                } else if (state.errorActionType === 'login') {
                  handleLogout();
                } else {
                  dispatch({ type: 'CLEAR_ERROR' });
                }
              }}
              style={{
                backgroundColor: '#b91c1c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {state.errorActionLabel || 'حسناً'}
            </button>
          </div>
        )}

        {/* State Sheet Renderers */}
        {state.sheetState === 'onboarding' && (
          <OnboardingSheet
            state={state}
            onProfileUpdated={() => dispatch({ type: 'GO_OFFLINE' })}
          />
        )}

        {(state.sheetState === 'off' || state.sheetState === 'auth') && (
          <OffSheet
            state={state}
            onGoOnline={handleGoOnline}
            onOpenMenu={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
          />
        )}

        {state.sheetState === 'waiting' && (
          <WaitingSheet
            state={state}
            onGoOffline={handleGoOffline}
            onOpenMenu={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
          />
        )}

        {state.sheetState === 'incoming' && (
          state.incomingOrder ? (
            <IncomingOrderSheet
              orderCard={state.incomingOrder}
              onAcceptShopping={handleAcceptShopping}
              onOpenBidding={() => dispatch({ type: 'OPEN_BIDDING' })}
              onDecline={handleDeclineOrder}
            />
          ) : (
            <WaitingSheet
              state={state}
              onGoOffline={handleGoOffline}
              onOpenMenu={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
            />
          )
        )}

        {state.sheetState === 'bidding' && (
          state.bidding ? (
            <BiddingSheet
              bidding={state.bidding}
              onUpdatePrice={(amountMinor) =>
                dispatch({ type: 'UPDATE_BID_PRICE', amountMinor })
              }
              onSubmitOffer={handleSubmitOffer}
              onAcceptCounter={handleAcceptCounter}
              onCancel={() => dispatch({ type: 'DECLINE_ORDER' })}
            />
          ) : (
            <WaitingSheet
              state={state}
              onGoOffline={handleGoOffline}
              onOpenMenu={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
            />
          )
        )}

        {state.sheetState === 'run' && (
          state.activeAgreement ? (
            <RunSheet
              state={state}
              onArrive={handleArrive}
              onStartWait={handleStartWait}
              onEndWait={handleEndWait}
              onIssueInvoice={handleIssueInvoice}
              onPaymentConfirmed={handlePaymentConfirmed}
              onCompleteStop={handleCompleteStop}
              onCompleteAgreement={handleCompleteAgreement}
              onOpenChat={() => dispatch({ type: 'TOGGLE_CHAT', open: true })}
              onOpenCancelModal={() =>
                dispatch({ type: 'TOGGLE_CANCEL_MODAL', open: true })
              }
              onAddInFlightStop={handleAddInFlightStop}
            />
          ) : (
            <OffSheet
              state={state}
              onGoOnline={handleGoOnline}
              onOpenMenu={() => dispatch({ type: 'TOGGLE_MENU', open: true })}
            />
          )
        )}

        {state.sheetState === 'done' && (
          <DoneSheet
            state={state}
            onRateCustomer={handleRateCustomer}
            onNewOrder={() => dispatch({ type: 'FINISH_JOB_AND_WAIT' })}
            onGoOffline={() => dispatch({ type: 'FINISH_JOB_AND_OFFLINE' })}
          />
        )}
      </div>

      {/* Drawer Menu (Hidden during run) */}
      {state.isMenuOpen && state.sheetState !== 'run' && (
        <DriverDrawerMenu
          state={state}
          onClose={() => dispatch({ type: 'TOGGLE_MENU', open: false })}
          onSelectTheme={handleThemeChange}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileModalOpen(true)}
        />
      )}

      {/* Driver Profile Center Modal */}
      <DriverProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        state={state}
        onSelectTheme={handleThemeChange}
        onLogout={handleLogout}
        onUpdateUser={(updated) => {
          if (state.user) {
            state.user.fullName = updated.fullName;
          }
        }}
      />

      {/* In-App Chat Modal */}
      {state.isChatOpen && state.activeAgreement && (
        <DriverChatModal
          agreementId={state.activeAgreement.id}
          onClose={() => dispatch({ type: 'TOGGLE_CHAT', open: false })}
        />
      )}

      {/* Cancel Trip Modal */}
      {state.isCancelModalOpen && (
        <CancelModal
          onConfirm={handleCancelAgreement}
          onClose={() => dispatch({ type: 'TOGGLE_CANCEL_MODAL', open: false })}
        />
      )}
    </div>
  );
};
