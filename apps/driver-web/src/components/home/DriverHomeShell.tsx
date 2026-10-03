import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';

interface DriverHomeShellProps {
  user: any;
  onLogout: () => void;
}

export const DriverHomeShell: React.FC<DriverHomeShellProps> = ({ user, onLogout }) => {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const refreshToken = localStorage.getItem('wasel_driver_refresh_token');
      await apiClient.auth.logout(refreshToken || undefined);
    } catch (e) {
      console.warn('Logout error', e);
    } finally {
      localStorage.removeItem('wasel_driver_access_token');
      localStorage.removeItem('wasel_driver_refresh_token');
      localStorage.removeItem('wasel_driver_user');
      onLogout();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
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
            {t('welcome')}: {user.fullName || user.phone}
          </h2>
          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {t('driver.activeZone')}
          </span>
        </div>
        <Chip
          label={isOnline ? 'متصل' : 'غير متصل'}
          variant={isOnline ? 'ok' : 'default'}
        />
      </header>

      {/* Online/Offline Status Card */}
      <div
        style={{
          backgroundColor: isOnline ? 'rgba(31, 138, 91, 0.08)' : 'var(--color-chip)',
          border: `1.5px solid ${isOnline ? 'var(--color-ok)' : 'transparent'}`,
          borderRadius: 'var(--radius-md)',
          padding: '24px 20px',
          marginBottom: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
          {isOnline ? '🟢' : '⚪'}
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          {isOnline ? t('driver.statusOnline') : t('driver.statusOffline')}
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '20px' }}>
          {isOnline
            ? 'أنت جاهز الآن لاستقبال عروض المشاوير والطلبات القريبة في حدائق الأهرام'
            : 'اضغط على الزر أدناه لتفعيل اتصالك وبدء استقبال الطلبات'}
        </p>

        <Button
          variant={isOnline ? 'outline' : 'primary'}
          onClick={() => setIsOnline(!isOnline)}
        >
          {isOnline ? t('driver.toggleOffline') : t('driver.toggleOnline')}
        </Button>
      </div>

      {/* Driver info & Subscription status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
        <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>💳 {t('driver.subscriptionStatus')}</div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            المنصة لا تخصم أي عمولات من التوصيل (نظام اشتراكات دورية فقط).
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>🛵 {t('driver.vehicleType')}</div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            مركبة معتمدة لنقل المشاوير والطرود المتوسطة.
          </div>
        </div>
      </div>

      <Button variant="outline" isLoading={loggingOut} onClick={handleLogout}>
        {t('auth.logout')}
      </Button>
    </div>
  );
};
