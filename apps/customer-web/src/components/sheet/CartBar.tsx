import React from 'react';
import { QuoteDetails } from '../../types/customer.js';
import { Plus, ShoppingCart } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface CartBarProps {
  stopsCount: number;
  maxTasks: number;
  quote: QuoteDetails | null;
  onOpenCart: () => void;
  onAddNoLocationStop: () => void;
}

export const CartBar: React.FC<CartBarProps> = ({
  stopsCount,
  maxTasks,
  quote,
  onOpenCart,
  onAddNoLocationStop,
}) => {
  if (stopsCount === 0) return null;

  const minFareText = quote
    ? quote.formattedFareEgp
    : `يبدأ من ${formatEgp(20)}`;

  const isMaxReached = stopsCount >= maxTasks;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(16px + var(--safe-bottom, 0px))',
        left: '16px',
        right: '16px',
        maxWidth: '500px',
        margin: '0 auto',
        backgroundColor: 'var(--color-ink, #12302b)',
        color: 'var(--color-sheet, #ffffff)',
        borderRadius: 'var(--radius-lg, 24px)',
        padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 900,
        animation: 'waselSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Information */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              backgroundColor: 'var(--color-accent, #f2a20c)',
              color: '#12302b',
              borderRadius: '999px',
              padding: '1px 8px',
              fontWeight: 800,
              fontSize: '0.8rem',
            }}
          >
            {stopsCount} {stopsCount === 1 ? 'مهمة' : 'مهام'}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#e5e7eb' }}>
            · الحد الأدنى للأجرة:
          </span>
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-accent, #f2a20c)' }}>
          {minFareText}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isMaxReached && (
          <button
            type="button"
            onClick={onAddNoLocationStop}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 14px)',
              padding: '8px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} />
            طلب بلا مكان
          </button>
        )}

        <button
          type="button"
          onClick={onOpenCart}
          style={{
            minHeight: '44px',
            backgroundColor: 'var(--color-accent, #f2a20c)',
            color: '#12302b',
            border: 'none',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          <ShoppingCart size={16} />
          راجع الطلب
        </button>
      </div>
    </div>
  );
};
