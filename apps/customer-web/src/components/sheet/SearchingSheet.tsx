import React from 'react';
import { Button } from '../ui/Button.js';
import { Radar, XCircle } from 'lucide-react';

interface SearchingSheetProps {
  orderId: string;
  onCancelClick: () => void;
}

export const SearchingSheet: React.FC<SearchingSheetProps> = ({ orderId, onCancelClick }) => {
  return (
    <div
      data-order-id={orderId}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px', padding: '10px 0' }}
    >
      {/* Pulsing radar icon */}
      <div
        style={{
          position: 'relative',
          width: '84px',
          height: '84px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-chip, #eef3ef)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent, #f2a20c)',
        }}
      >
        <Radar size={42} style={{ animation: 'spin 3s linear infinite' }} />
        <span
          style={{
            position: 'absolute',
            inset: '-8px',
            borderRadius: '50%',
            border: '2px solid var(--color-accent, #f2a20c)',
            opacity: 0.5,
            animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ping {
          75%, 100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>

      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
          جاري البحث عن أقرب كابتن...
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '320px', margin: '0 auto', lineHeight: 1.5 }}>
          تم بث طلبك لكباتن حدائق الأهرام المتواجدين بالقرب منك. سيصلك إشعار فوري عند قبول الكابتن أو تقديم عرض.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: '340px' }}>
        <Button
          variant="outline"
          onClick={onCancelClick}
          style={{
            minHeight: '48px',
            height: '50px',
            border: '1.5px solid #dc2626',
            color: '#dc2626',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <XCircle size={18} />
          إلغاء الطلب
        </Button>
      </div>
    </div>
  );
};
