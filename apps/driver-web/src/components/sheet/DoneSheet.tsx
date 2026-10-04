import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { DriverAppState } from '../../types/driver.js';

interface DoneSheetProps {
  state: DriverAppState;
  onRateCustomer: (rating: number, notes?: string) => void;
  onNewOrder: () => void;
  onGoOffline: () => void;
  isLoading?: boolean;
}

export const DoneSheet: React.FC<DoneSheetProps> = ({
  state,
  onRateCustomer,
  onNewOrder,
  onGoOffline,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const [rating, setRating] = useState<number>(5);
  const [ratingNotes, setRatingNotes] = useState<string>('');
  const [hasRated, setHasRated] = useState<boolean>(false);

  const settlement = state.settlement;
  const visitsFeeEgp = settlement ? (settlement.visitsFeeMinor / 100).toFixed(0) : '0';
  const waitFeeEgp = settlement ? (settlement.waitFeeMinor / 100).toFixed(0) : '0';
  const goodsCommEgp = settlement ? (settlement.goodsCommissionMinor / 100).toFixed(0) : '0';
  const invoicesTotalEgp = settlement ? (settlement.invoicesTotalMinor / 100).toFixed(0) : '0';
  const totalFareEgp = settlement ? (settlement.totalFareMinor / 100).toFixed(0) : '0';

  const handleRatingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRateCustomer(rating, ratingNotes.trim() || undefined);
    setHasRated(true);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
      }}
    >
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>🎉</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--color-ok, #1f8a5b)' }}>
          {t('done.title')}
        </h2>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          تم تسجيل اكتمال المشوار بنجاح
        </span>
      </div>

      {/* Driver Settlement Breakdown (Prompt requirement: visits, waiting, percent of invoices, total) */}
      <div
        style={{
          backgroundColor: 'var(--color-chip, #eef3ef)',
          border: '2px solid var(--color-ok, #1f8a5b)',
          borderRadius: 'var(--radius-md, 18px)',
          padding: '16px',
        }}
      >
        <div
          style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            marginBottom: '10px',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            paddingBottom: '6px',
            color: 'var(--color-ink)',
          }}
        >
          📊 {t('done.settlementTitle')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#4b5563' }}>أجر الزيارات والمحطات:</span>
            <strong>{visitsFeeEgp} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#4b5563' }}>أجر ساعات الانتظار:</span>
            <strong>{waitFeeEgp} ج.م</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#4b5563' }}>عمولة البضائع والمشتريات (10%):</span>
            <strong>{goodsCommEgp} ج.م</strong>
          </div>

          {settlement && settlement.invoicesTotalMinor > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px dashed #d1d5db',
                fontSize: '0.85rem',
                color: '#6b7280',
              }}
            >
              <span>مشتريات المتجر المسددة للبائع:</span>
              <span>{invoicesTotalEgp} ج.م</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '8px',
              paddingTop: '10px',
              borderTop: '2px solid var(--color-ink, #12302b)',
              fontSize: '1.15rem',
            }}
          >
            <span style={{ fontWeight: 800 }}>صافي الأجرة المستحقة للكابتن:</span>
            <span
              data-testid="settlement-total-fare"
              style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                color: 'var(--color-ok, #1f8a5b)',
              }}
            >
              {totalFareEgp} ج.م
            </span>
          </div>
        </div>
      </div>

      {/* Today's total earnings updated */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(31, 138, 91, 0.08)',
          borderRadius: 'var(--radius-sm, 14px)',
          padding: '12px 14px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
            💰 إجمالي أرباح وردية اليوم
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            {state.todayEarnings.completedTripsCount} مشاوير منجزة
          </div>
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-ok)' }}>
          {state.todayEarnings.formattedTotalEarnings}
        </div>
      </div>

      {/* Customer Rating Box */}
      {!hasRated ? (
        <form
          onSubmit={handleRatingSubmit}
          style={{
            backgroundColor: 'var(--color-sheet, #ffffff)',
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '14px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px' }}>
            ⭐ {t('done.rateCustomer')}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.8rem',
                  cursor: 'pointer',
                  color: star <= rating ? '#f59e0b' : '#d1d5db',
                  padding: '0 2px',
                }}
              >
                ★
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder={t('done.ratingNotes')}
            value={ratingNotes}
            onChange={(e) => setRatingNotes(e.target.value)}
            style={{
              width: '100%',
              height: '42px',
              padding: '0 12px',
              fontSize: '0.9rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #e5e7eb)',
              marginBottom: '10px',
            }}
          />

          <Button
            type="submit"
            variant="secondary"
            style={{ minHeight: '44px', height: '44px', fontSize: '0.95rem' }}
          >
            إرسال التقييم
          </Button>
        </form>
      ) : (
        <div
          style={{
            textAlign: 'center',
            fontSize: '0.85rem',
            color: 'var(--color-ok, #1f8a5b)',
            fontWeight: 700,
          }}
        >
          ✓ شكراً لك، تم تسجيل تقييمك للعميل!
        </div>
      )}

      {/* Action Buttons: New Order vs Go Offline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
        <Button
          variant="success"
          isLoading={isLoading}
          onClick={onNewOrder}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1.15rem',
            fontWeight: 800,
          }}
        >
          🛵 {t('done.newOrder')}
        </Button>

        <Button
          variant="outline"
          disabled={isLoading}
          onClick={onGoOffline}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1rem',
          }}
        >
          ☕ {t('done.goOffline')}
        </Button>
      </div>
    </div>
  );
};
