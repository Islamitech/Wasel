import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { DriverAppState } from '../../types/driver.js';

interface WaitingSheetProps {
  state: DriverAppState;
  onGoOffline: () => void;
  onOpenMenu: () => void;
}

export const WaitingSheet: React.FC<WaitingSheetProps> = ({
  state,
  onGoOffline,
  onOpenMenu,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      {/* Top status bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'right',
        }}
      >
        <div>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {t('driver.activeZone')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Chip label="متصل 🟢" variant="ok" />
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

      {/* Radar Pulse Display */}
      <div
        style={{
          margin: '12px auto',
          position: 'relative',
          width: '90px',
          height: '90px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: 'rgba(31, 138, 91, 0.15)',
            animation: 'driverPulse 2s infinite ease-out',
          }}
        />
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-ok, #1f8a5b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.8rem',
            color: 'white',
            zIndex: 1,
            boxShadow: '0 4px 14px rgba(31, 138, 91, 0.4)',
          }}
        >
          🛵
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '6px' }}>
          {t('driver.statusOnline')}
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
          {t('driver.keepAppOpen')}
        </p>
      </div>

      {/* Offline pending badge */}
      {state.offlineQueueCount > 0 && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            color: '#b45309',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
            fontWeight: 600,
            border: '1px solid #fde68a',
          }}
        >
          ⏳ {t('driver.offlineActionsPending', { count: state.offlineQueueCount })}
        </div>
      )}

      {/* The Single Primary Button */}
      <div style={{ marginTop: '8px' }}>
        <Button
          variant="outline"
          onClick={onGoOffline}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1.05rem',
          }}
        >
          ☕ {t('driver.toggleOffline')}
        </Button>
      </div>
    </div>
  );
};
