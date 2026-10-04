import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { IncomingOrderCard } from '../../types/driver.js';

interface IncomingOrderSheetProps {
  orderCard: IncomingOrderCard;
  onAcceptShopping: (orderId: string) => void;
  onOpenBidding: () => void;
  onDecline: (orderId: string) => void;
  isLoading?: boolean;
}

export const IncomingOrderSheet: React.FC<IncomingOrderSheetProps> = ({
  orderCard,
  onAcceptShopping,
  onOpenBidding,
  onDecline,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  // Countdown timer calculated from expiresAt
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const exp = new Date(orderCard.expiresAt).getTime();
    const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
    return diff > 0 ? diff : 45;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const exp = new Date(orderCard.expiresAt).getTime();
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0) {
        clearInterval(timer);
        onDecline(orderCard.orderId);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [orderCard.expiresAt, orderCard.orderId, onDecline]);

  const formattedMinFare = `${(orderCard.minFareMinor / 100).toFixed(0)} ج.م`;
  const formattedDistance =
    orderCard.distanceMeters > 1000
      ? `${(orderCard.distanceMeters / 1000).toFixed(1)} كم`
      : `${orderCard.distanceMeters} م`;

  const isShopping = orderCard.orderType === 'shopping';

  return (
    <div
      role="region"
      aria-live="assertive"
      aria-label={t('incoming.title')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
      }}
    >
      {/* Top Banner & Expiry countdown */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
          paddingBottom: '12px',
        }}
      >
        <span
          style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            color: 'var(--color-accent, #f2a20c)',
          }}
        >
          ⚡ {t('incoming.title')}
        </span>
        <Chip
          label={`⏳ ${secondsRemaining} ثانية`}
          variant={secondsRemaining <= 10 ? 'danger' : 'accent'}
        />
      </div>

      {/* MINIMUM FARE AS THE LARGEST ELEMENT (Prompt Requirement) */}
      <div
        style={{
          backgroundColor: 'rgba(31, 138, 91, 0.08)',
          border: '2px solid var(--color-ok, #1f8a5b)',
          borderRadius: 'var(--radius-md, 18px)',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '4px' }}>
          {t('incoming.minFare')}
        </div>
        <div
          data-testid="incoming-min-fare"
          style={{
            fontSize: '3rem',
            fontWeight: 900,
            color: 'var(--color-ok, #1f8a5b)',
            lineHeight: 1.1,
          }}
        >
          {formattedMinFare}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
          صافي الأجرة المحسوبة المبدئية (كاش)
        </div>
      </div>

      {/* Order specs: Distance, Visits, Value Tier, Load Size */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
          }}
        >
          📍 <strong>{t('incoming.distance', { distance: formattedDistance })}</strong>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
          }}
        >
          🏬 <strong>{t('incoming.visits', { count: orderCard.billableVisits })}</strong>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
          }}
        >
          🏷️ <strong>{orderCard.valueTierNameAr}</strong>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
          }}
        >
          📦 <strong>{orderCard.loadSizeNameAr}</strong>
        </div>
      </div>

      {/* Wait Mode Flag */}
      <div
        style={{
          backgroundColor:
            orderCard.waitMode === 'wait'
              ? 'rgba(242, 162, 12, 0.12)'
              : 'var(--color-chip, #eef3ef)',
          border: `1px solid ${orderCard.waitMode === 'wait' ? 'var(--color-accent)' : 'transparent'}`,
          borderRadius: 'var(--radius-sm, 14px)',
          padding: '10px 14px',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        ⏱️{' '}
        {orderCard.waitMode === 'wait'
          ? t('incoming.waitModeWait')
          : t('incoming.waitModeNotify')}
      </div>

      {/* Ordered Stops List */}
      <div>
        <div
          style={{
            fontSize: '0.9rem',
            fontWeight: 700,
            marginBottom: '8px',
            color: 'var(--color-ink)',
          }}
        >
          {t('incoming.stopsList')} ({orderCard.stops.length}):
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxHeight: '140px',
            overflowY: 'auto',
          }}
        >
          {orderCard.stops.map((stop) => (
            <div
              key={stop.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'var(--color-chip, #eef3ef)',
                borderRadius: 'var(--radius-sm, 14px)',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{
                  backgroundColor: 'var(--color-ink, #12302b)',
                  color: 'white',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {stop.seq}
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <span style={{ fontWeight: 700 }}>{stop.actionNameAr}</span>
                {stop.placeNameAr && (
                  <span style={{ color: '#4b5563' }}> — {stop.placeNameAr}</span>
                )}
                {stop.notes && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    ملاحظة: {stop.notes}
                  </div>
                )}
              </div>
              {stop.invoiceRequired && (
                <span style={{ fontSize: '0.75rem', color: '#b45309' }}>🧾 فاتورة</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons: One Primary (>=56px) + One Secondary (>=56px) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        {isShopping ? (
          <Button
            variant="success"
            isLoading={isLoading}
            onClick={() => onAcceptShopping(orderCard.orderId)}
            style={{
              minHeight: '56px',
              height: '56px',
              fontSize: '1.2rem',
              fontWeight: 800,
            }}
          >
            ✅ {t('incoming.accept')}
          </Button>
        ) : (
          <Button
            variant="accent"
            isLoading={isLoading}
            onClick={onOpenBidding}
            style={{
              minHeight: '56px',
              height: '56px',
              fontSize: '1.15rem',
              fontWeight: 800,
            }}
          >
            💬 {t('incoming.makeOffer')}
          </Button>
        )}

        <Button
          variant="outline"
          disabled={isLoading}
          onClick={() => onDecline(orderCard.orderId)}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1rem',
          }}
        >
          ✕ {t('incoming.ignore')}
        </Button>
      </div>
    </div>
  );
};
