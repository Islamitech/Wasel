import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button.js';
import { Radar, XCircle, Navigation } from 'lucide-react';

interface SearchingSheetProps {
  orderId: string;
  onCancelClick: () => void;
}

export const SearchingSheet: React.FC<SearchingSheetProps> = ({ orderId, onCancelClick }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      data-order-id={orderId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '18px',
        padding: '12px 4px',
        direction: 'rtl',
      }}
    >
      {/* Enhanced Multi-ring Pulsing Radar */}
      <div
        style={{
          position: 'relative',
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-chip, #eef3ef)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent, #f2a20c)',
        }}
      >
        <Radar size={48} style={{ animation: 'spin 3.5s linear infinite' }} />

        {/* Ring 1 */}
        <span
          style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '50%',
            border: '2px solid var(--color-accent, #f2a20c)',
            opacity: 0.6,
            animation: 'radarPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />

        {/* Ring 2 */}
        <span
          style={{
            position: 'absolute',
            inset: '-20px',
            borderRadius: '50%',
            border: '1.5px solid var(--color-brand, #12302b)',
            opacity: 0.35,
            animation: 'radarPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite 0.7s',
          }}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes radarPulse {
          0% { transform: scale(0.85); opacity: 0.8; }
          75%, 100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

      <div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '6px' }}>
          جاري البحث عن أقرب كابتن...
        </h3>

        {/* Elapsed Timer Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--color-brand, #12302b)',
            marginBottom: '8px',
          }}
        >
          <span>مدة البحث:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{formatTime(seconds)}</span>
        </div>

        <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '320px', margin: '0 auto', lineHeight: 1.5 }}>
          تم بث طلبك لكباتن حدائق الأهرام المتواجدين بالقرب منك. سيصلك إشعار فوري وتنبيه لحظي عند القبول.
        </p>

        {/* Nearby Captains Active Indicator */}
        <div
          style={{
            marginTop: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            color: '#16a34a',
            fontWeight: 700,
            backgroundColor: '#dcfce7',
            padding: '4px 10px',
            borderRadius: '10px',
          }}
        >
          <Navigation size={13} />
          <span>كباتن واصل متصلون وجاهزون حولك الآن</span>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '340px', marginTop: '6px' }}>
        <Button
          variant="outline"
          onClick={onCancelClick}
          style={{
            minHeight: '48px',
            height: '50px',
            border: '1.5px solid #dc2626',
            color: '#dc2626',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
