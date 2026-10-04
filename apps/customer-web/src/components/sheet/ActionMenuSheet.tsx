import React from 'react';
import { SelectedMapPoint } from '../../types/customer.js';
import { ServiceActionDto } from '@wasel/api-client';
import { ShoppingBag, ArrowUpRight, ArrowDownLeft, Truck, Package } from 'lucide-react';

interface ActionMenuSheetProps {
  selectedPoint: SelectedMapPoint;
  serviceActions: ServiceActionDto[];
  onSelectAction: (action: ServiceActionDto) => void;
  onCancel: () => void;
}

export const ActionMenuSheet: React.FC<ActionMenuSheetProps> = ({
  selectedPoint,
  serviceActions,
  onSelectAction,
  onCancel,
}) => {
  // Sort actions dynamically based on pointType
  const sortedActions = [...serviceActions].sort((a, b) => {
    const codeA = a.code;
    const codeB = b.code;

    if (selectedPoint.pointType === 'shop') {
      const order = ['buy', 'pick', 'drop', 'move', 'find'];
      return order.indexOf(codeA) - order.indexOf(codeB);
    } else if (selectedPoint.pointType === 'customer_pin') {
      const order = ['pick', 'drop', 'buy', 'move', 'find'];
      return order.indexOf(codeA) - order.indexOf(codeB);
    } else {
      // Empty point
      const order = ['drop', 'pick', 'move', 'buy', 'find'];
      return order.indexOf(codeA) - order.indexOf(codeB);
    }
  });

  const getActionIcon = (code: string) => {
    switch (code) {
      case 'buy':
        return <ShoppingBag size={22} />;
      case 'pick':
        return <ArrowUpRight size={22} />;
      case 'drop':
        return <ArrowDownLeft size={22} />;
      case 'move':
        return <Truck size={22} />;
      default:
        return <Package size={22} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Point header */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'var(--color-chip, #eef3ef)',
          borderRadius: 'var(--radius-sm, 14px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>الموقع المحدد:</span>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-ink, #12302b)' }}>
            {selectedPoint.addressLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '0.85rem',
            color: '#6b7280',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          إلغاء
        </button>
      </div>

      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-ink, #12302b)' }}>
        اختر نوع الخدمة في هذه النقطة:
      </div>

      {/* Dynamic 4 action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        {sortedActions.slice(0, 4).map((action, index) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onSelectAction(action)}
            style={{
              minHeight: '52px',
              padding: '14px 18px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: index === 0 ? '2px solid var(--color-ink, #12302b)' : '1px solid #d1d5db',
              backgroundColor: index === 0 ? 'var(--color-ink, #12302b)' : 'var(--color-sheet, #ffffff)',
              color: index === 0 ? 'var(--color-sheet, #ffffff)' : 'var(--color-ink, #12302b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
              fontFamily: 'var(--font-family)',
              boxShadow: index === 0 ? '0 3px 12px rgba(18, 48, 43, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  color: index === 0 ? 'var(--color-accent, #f2a20c)' : 'var(--color-ink, #12302b)',
                  display: 'flex',
                }}
              >
                {getActionIcon(action.code)}
              </span>
              <span>{action.nameAr}</span>
            </div>
            {index === 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: 'var(--color-accent, #f2a20c)',
                  color: '#12302b',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontWeight: 700,
                }}
              >
                الموصى به
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
