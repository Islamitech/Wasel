import React, { useState } from 'react';
import { Button } from '../ui/Button.js';
import { X, AlertCircle } from 'lucide-react';

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string) => void;
  isProcessing: boolean;
}

const CANCEL_REASONS = [
  'تأخر وصول الكابتن أو العروض',
  'قمت بالطلب عن طريق الخطأ',
  'لم أعد بحاجة للمشوار',
  'أريد تعديل المحطات أو التفاصيل',
  'سبب آخر',
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  onClose,
  onConfirmCancel,
  isProcessing,
}) => {
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const reason = selectedReason === 'سبب آخر' ? customReason : (selectedReason || '');
    if (reason && reason.trim()) {
      onConfirmCancel(reason.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          borderRadius: 'var(--radius-lg, 24px)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 800, fontSize: '1.1rem' }}>
            <AlertCircle size={22} />
            تأكيد إلغاء الطلب
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
          يرجى اختيار سبب الإلغاء لمساعدتنا في تحسين الخدمة:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                padding: '6px 0',
              }}
            >
              <input
                type="radio"
                name="cancel-reason"
                checked={selectedReason === r}
                onChange={() => setSelectedReason(r)}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {selectedReason === 'سبب آخر' && (
          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="يرجى كتابة سبب الإلغاء..."
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid #d1d5db',
              fontFamily: 'var(--font-family)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <Button
            variant="danger"
            isLoading={isProcessing}
            onClick={handleConfirm}
            style={{ minHeight: '48px', height: '48px', fontWeight: 700 }}
          >
            تأكيد الإلغاء
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            style={{ minHeight: '48px', height: '48px', fontWeight: 600 }}
          >
            تراجع
          </Button>
        </div>
      </div>
    </div>
  );
};
