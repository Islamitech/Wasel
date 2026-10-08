import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { DriverAppState, ThemeMode } from '../../types/driver.js';

interface DriverDrawerMenuProps {
  state: DriverAppState;
  onClose: () => void;
  onSelectTheme: (theme: ThemeMode) => void;
  onLogout: () => void;
  onOpenProfile?: () => void;
}

export const DriverDrawerMenu: React.FC<DriverDrawerMenuProps> = ({
  state,
  onClose,
  onSelectTheme,
  onLogout,
  onOpenProfile,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'flex-start',
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--color-sheet, #ffffff)',
          width: '82%',
          maxWidth: '360px',
          height: '100%',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 0 24px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header (Clickable for profile) */}
          <div
            onClick={() => {
              if (onOpenProfile) {
                onClose();
                onOpenProfile();
              }
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-border, #e5e7eb)',
              paddingBottom: '12px',
              cursor: 'pointer',
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                {state.user?.fullName || 'كابتن واصل'}
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                {state.user?.phone} • تفاصيل الملف ⚙️
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="إغلاق القائمة"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.4rem',
                cursor: 'pointer',
                color: 'var(--color-ink)',
              }}
            >
              ✕
            </button>
          </div>

          {/* Profile & Vehicle Center Button */}
          {onOpenProfile && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                borderRadius: 'var(--radius-sm, 14px)',
                backgroundColor: 'var(--color-brand, #12302b)',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span>🚗 الملف الشخصي والمركبة</span>
            </button>
          )}

          {/* Verification Status Card */}
          <div
            style={{
              backgroundColor: 'var(--color-chip, #eef3ef)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm, 14px)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              🛡️ {t('driver.verificationLevel')}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px' }}>
              {state.verification?.level === 3
                ? t('driver.level3')
                : state.verification?.level === 2
                ? t('driver.level2')
                : t('driver.level1')}
            </div>
          </div>

          {/* Subscription Info Card */}
          <div
            style={{
              backgroundColor: 'var(--color-chip, #eef3ef)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm, 14px)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              💳 {t('driver.subscriptionStatus')}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px' }}>
              {state.subscription?.isTrial
                ? t('driver.trialRemaining', { days: state.subscription.remainingDays })
                : t('driver.activeSubscription')}
            </div>
          </div>

          {/* Today earnings preview */}
          <div
            style={{
              backgroundColor: 'rgba(31, 138, 91, 0.08)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid rgba(31, 138, 91, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
              💰 {t('driver.todayEarnings')}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ok)' }}>
              {state.todayEarnings.formattedTotalEarnings}
            </div>
          </div>

          {/* Theme Selector (Light, Dark, Sunlight) */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
              🎨 مظهر التطبيق:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                type="button"
                onClick={() => onSelectTheme('light')}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: state.theme === 'light' ? 800 : 500,
                  backgroundColor: state.theme === 'light' ? 'var(--color-ink)' : 'var(--color-chip)',
                  color: state.theme === 'light' ? '#fff' : 'var(--color-ink)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ☀️ فاتح
              </button>

              <button
                type="button"
                onClick={() => onSelectTheme('dark')}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: state.theme === 'dark' ? 800 : 500,
                  backgroundColor: state.theme === 'dark' ? 'var(--color-ink)' : 'var(--color-chip)',
                  color: state.theme === 'dark' ? '#fff' : 'var(--color-ink)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🌙 داكن
              </button>

              <button
                type="button"
                onClick={() => onSelectTheme('sunlight')}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: state.theme === 'sunlight' ? 800 : 500,
                  backgroundColor: state.theme === 'sunlight' ? '#f59e0b' : 'var(--color-chip)',
                  color: state.theme === 'sunlight' ? '#000' : 'var(--color-ink)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ⚡ شمس
              </button>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div>
          <Button
            variant="outline"
            onClick={onLogout}
            style={{ minHeight: '52px', height: '52px', fontSize: '0.95rem' }}
          >
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </div>
  );
};
