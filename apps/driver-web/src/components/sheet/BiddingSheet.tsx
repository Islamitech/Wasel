import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { BiddingState } from '../../types/driver.js';

interface BiddingSheetProps {
  bidding: BiddingState;
  onUpdatePrice: (amountMinor: number) => void;
  onSubmitOffer: () => void;
  onAcceptCounter: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const BiddingSheet: React.FC<BiddingSheetProps> = ({
  bidding,
  onUpdatePrice,
  onSubmitOffer,
  onAcceptCounter,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const currentFareEgp = (bidding.currentOfferMinor / 100).toFixed(0);
  const suggestedFareEgp = (bidding.suggestedFareMinor / 100).toFixed(0);
  const counterFareEgp = bidding.customerCounterMinor
    ? (bidding.customerCounterMinor / 100).toFixed(0)
    : null;

  const isWaiting = bidding.status === 'sent_waiting';
  const hasCounter = bidding.status === 'counter_received';

  const handleStep = (deltaEgp: number) => {
    const newMinor = bidding.currentOfferMinor + deltaEgp * 100;
    if (newMinor >= 1000) {
      onUpdatePrice(newMinor);
    }
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
      {/* Header and round info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
          paddingBottom: '12px',
        }}
      >
        <span style={{ fontSize: '1rem', fontWeight: 800 }}>
          {t('bidding.title')}
        </span>
        <Chip
          label={t('bidding.roundInfo', {
            round: bidding.round,
            max: bidding.maxRounds,
          })}
          variant="accent"
        />
      </div>

      {/* Suggested price hint */}
      <div
        style={{
          backgroundColor: 'var(--color-chip, #eef3ef)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm, 14px)',
          fontSize: '0.85rem',
          color: '#4b5563',
          textAlign: 'center',
        }}
      >
        {t('bidding.suggestedPrice', { price: `${suggestedFareEgp} ج.م` })}
      </div>

      {/* Customer Counter Offer Alert */}
      {hasCounter && (
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '2px solid #3b82f6',
            borderRadius: 'var(--radius-md, 18px)',
            padding: '14px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#1d4ed8', fontWeight: 700 }}>
            {t('bidding.counterReceived', { price: `${counterFareEgp} ج.م` })}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '4px' }}>
            يمكنك قبول هذا العرض للبدء فوراً، أو تعديل السعر وإرسال عرض مضاد.
          </div>
        </div>
      )}

      {/* Price Stepper (when not waiting) */}
      {!isWaiting ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(242, 162, 12, 0.08)',
            border: '2px solid var(--color-accent, #f2a20c)',
            borderRadius: 'var(--radius-md, 18px)',
            padding: '12px 16px',
          }}
        >
          <button
            type="button"
            onClick={() => handleStep(-10)}
            disabled={bidding.currentOfferMinor <= 1000}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-sheet, #ffffff)',
              border: '2px solid var(--color-ink, #12302b)',
              fontSize: '1.6rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            -
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              {t('bidding.yourOffer', { price: '' })}
            </div>
            <div
              data-testid="bidding-current-price"
              style={{
                fontSize: '2.5rem',
                fontWeight: 900,
                color: 'var(--color-ink, #12302b)',
                lineHeight: 1.1,
              }}
            >
              {currentFareEgp} <span style={{ fontSize: '1.2rem' }}>ج.م</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleStep(10)}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-sheet, #ffffff)',
              border: '2px solid var(--color-ink, #12302b)',
              fontSize: '1.6rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '24px 16px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-md, 18px)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>
            {t('bidding.waitingForCustomer')}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            العرض المرسل: {currentFareEgp} ج.م
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        {hasCounter && !isWaiting ? (
          <Button
            variant="success"
            isLoading={isLoading}
            onClick={onAcceptCounter}
            style={{
              minHeight: '56px',
              height: '56px',
              fontSize: '1.15rem',
              fontWeight: 800,
            }}
          >
            🤝 {t('bidding.acceptCounter')}
          </Button>
        ) : !isWaiting ? (
          <Button
            variant="accent"
            isLoading={isLoading}
            onClick={onSubmitOffer}
            style={{
              minHeight: '56px',
              height: '56px',
              fontSize: '1.15rem',
              fontWeight: 800,
            }}
          >
            🚀 {t('bidding.submitOffer')}
          </Button>
        ) : null}

        <Button
          variant="outline"
          disabled={isLoading}
          onClick={onCancel}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1rem',
          }}
        >
          ✕ {t('bidding.reject')}
        </Button>
      </div>
    </div>
  );
};
