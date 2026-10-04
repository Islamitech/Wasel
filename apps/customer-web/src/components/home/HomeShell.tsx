import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { formatEgp } from '@wasel/shared';

interface HomeShellProps {
  user: any;
  onLogout: () => void;
}

export const HomeShell: React.FC<HomeShellProps> = ({ user, onLogout }) => {
  const { t } = useTranslation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const refreshToken = localStorage.getItem('wasel_refresh_token');
      await apiClient.auth.logout(refreshToken || undefined);
    } catch (e) {
      console.warn('Logout error', e);
    } finally {
      localStorage.removeItem('wasel_access_token');
      localStorage.removeItem('wasel_refresh_token');
      localStorage.removeItem('wasel_user');
      onLogout();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-chip)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {t('home.greeting', { name: user.fullName || user.phone || 'يا بطل' })}
          </h2>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {t('home.activeRegion')}
          </span>
        </div>
        <Chip label={t('home.customerBadge')} variant="ok" />
      </header>

      {/* Hero / Notice */}
      <div
        style={{
          backgroundColor: 'var(--color-chip)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
          {t('welcome')}
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.6 }}>
          {t('home.readyNotice')}
        </p>
      </div>

      {/* Services List Preview */}
      <section style={{ marginBottom: '32px' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>
          {t('home.availableServices')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>🛍️ {t('home.errands')}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                يبدأ من {formatEgp(20)}
              </div>
            </div>
            <Chip label="طلب سريع" variant="accent" />
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>📦 {t('home.parcel')}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                يبدأ من {formatEgp(15)}
              </div>
            </div>
            <Chip label="طرود" variant="default" />
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>🚛 {t('home.moving')}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                يبدأ من {formatEgp(100)}
              </div>
            </div>
            <Chip label="نقل ثقيل" variant="default" />
          </div>
        </div>
      </section>

      {/* Logout Action */}
      <div style={{ marginTop: '40px' }}>
        <Button variant="outline" isLoading={loggingOut} onClick={handleLogout}>
          {t('auth.logout')}
        </Button>
      </div>
    </div>
  );
};

