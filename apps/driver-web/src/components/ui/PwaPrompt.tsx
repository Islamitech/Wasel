import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button.js';

export const PwaPrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleUpdate = () => setNeedRefresh(true);
    window.addEventListener('wasel-driver-sw-update', handleUpdate);
    return () => window.removeEventListener('wasel-driver-sw-update', handleUpdate);
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + var(--safe-bottom, 0px))',
        left: '16px',
        right: '16px',
        maxWidth: '420px',
        margin: '0 auto',
        backgroundColor: 'var(--color-sheet, #ffffff)',
        border: '1.5px solid var(--color-ink, #12302b)',
        borderRadius: 'var(--radius-md, 18px)',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('ui.updateAvailable')}</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('ui.updateNow')}
        </Button>
        <Button variant="secondary" onClick={() => setNeedRefresh(false)}>
          {t('ui.close')}
        </Button>
      </div>
    </div>
  );
};
