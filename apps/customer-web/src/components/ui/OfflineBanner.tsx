import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { t } = useTranslation();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      style={{
        backgroundColor: '#d97706',
        color: '#ffffff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '0.875rem',
        fontWeight: 600,
        position: 'sticky',
        top: 0,
        zIndex: 1500,
      }}
    >
      {t('ui.offline')}
    </div>
  );
};
