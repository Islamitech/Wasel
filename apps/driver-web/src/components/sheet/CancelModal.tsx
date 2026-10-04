import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';

interface CancelModalProps {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const CancelModal: React.FC<CancelModalProps> = ({
  onConfirm,
  onClose,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(reason.trim() || 'إلغاء بناءً على طلب الكابتن');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1300,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-sheet, #ffffff)',
          width: '100%',
          maxWidth: '400px',
          borderRadius: 'var(--radius-lg, 24px)',
          padding: '24px 20px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        }}
      >
        <h3
          style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            color: '#dc2626',
            marginBottom: '10px',
          }}
        >
          ⚠️ {t('run.cancelModal.title')}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              {t('run.cancelModal.reasonLabel')}
            </label>
            <textarea
              required
              rows={3}
              placeholder={t('run.cancelModal.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '0.95rem',
                borderRadius: 'var(--radius-sm, 14px)',
                border: '1.5px solid var(--color-border, #e5e7eb)',
                fontFamily: 'var(--font-family)',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="submit"
              variant="danger"
              isLoading={isLoading}
              style={{ minHeight: '52px', height: '52px', fontSize: '1rem' }}
            >
              {t('run.cancelModal.confirm')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={onClose}
              style={{ minHeight: '52px', height: '52px', fontSize: '1rem', width: '40%' }}
            >
              {t('run.cancelModal.back')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
