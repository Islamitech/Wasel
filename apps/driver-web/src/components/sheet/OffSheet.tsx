import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { DriverAppState } from '../../types/driver.js';

interface OffSheetProps {
  state: DriverAppState;
  onGoOnline: () => void;
  onOpenMenu: () => void;
}

export const OffSheet: React.FC<OffSheetProps> = ({
  state,
  onGoOnline,
  onOpenMenu,
}) => {
  const { t } = useTranslation();

  const remainingDays = state.subscription?.remainingDays ?? 30;
  const verificationLevel = state.verification?.level ?? 1;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {state.user?.fullName || state.user?.phone || t('welcome')}
          </h2>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {t('driver.activeZone')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Chip label="غير متصل" variant="default" />
          <button
            onClick={onOpenMenu}
            aria-label={t('driver.drawerMenu')}
            style={{
              background: 'var(--color-chip, #eef3ef)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.2rem',
              color: 'var(--color-ink)',
            }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Subscription & Verification info */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '12px 14px',
            border: '1px solid var(--color-border, #e5e7eb)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
            💳 {t('driver.subscriptionStatus')}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {state.subscription?.isTrial
              ? `تجريبي (${remainingDays} يوم)`
              : 'اشتراك نشط'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '12px 14px',
            border: '1px solid var(--color-border, #e5e7eb)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
            🛡️ {t('driver.verificationLevel')}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {verificationLevel === 3
              ? 'المستوى 3 (متميز)'
              : verificationLevel === 2
              ? 'المستوى 2 (موثق)'
              : 'المستوى 1 (أساسي)'}
          </div>
        </div>
      </div>

      {/* Today's earnings banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(31, 138, 91, 0.08)',
          borderRadius: 'var(--radius-sm, 14px)',
          padding: '14px 16px',
          border: '1px solid rgba(31, 138, 91, 0.2)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
            💰 {t('driver.todayEarnings')}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            {t('driver.completedTrips', { count: state.todayEarnings.completedTripsCount })}
          </div>
        </div>
        <div
          style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--color-ok, #1f8a5b)',
          }}
        >
          {state.todayEarnings.formattedTotalEarnings}
        </div>
      </div>

      {/* The Single Primary Button */}
      <div style={{ marginTop: '8px' }}>
        <Button
          variant="success"
          onClick={onGoOnline}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1.15rem',
            fontWeight: 800,
          }}
        >
          🟢 {t('driver.toggleOnline')}
        </Button>
      </div>
    </div>
  );
};
