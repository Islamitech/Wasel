import React from 'react';
import { CartStopItem, QuoteDetails } from '../../types/customer.js';
import { ValueTierDto, VehicleTypeDto } from '@wasel/api-client';
import { Button } from '../ui/Button.js';
import { ArrowUp, ArrowDown, Trash2, Clock, Truck, Plus, X } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface CartSheetProps {
  stops: CartStopItem[];
  valueTiers: ValueTierDto[];
  vehicleTypes: VehicleTypeDto[];
  selectedValueTierId: string | null;
  waitMode: 'wait' | 'notify';
  quote: QuoteDetails | null;
  isPublishing: boolean;
  onReorder: (from: number, to: number) => void;
  onDeleteStop: (stopId: string) => void;
  onSelectValueTier: (tierId: string) => void;
  onToggleWaitMode: (mode: 'wait' | 'notify') => void;
  onAddMoreStops: () => void;
  onPublish: () => void;
  onClose: () => void;
}

export const CartSheet: React.FC<CartSheetProps> = ({
  stops,
  valueTiers,
  vehicleTypes,
  selectedValueTierId,
  waitMode,
  quote,
  isPublishing,
  onReorder,
  onDeleteStop,
  onSelectValueTier,
  onToggleWaitMode,
  onAddMoreStops,
  onPublish,
  onClose,
}) => {
  // Check if wait mode is relevant: only when there are pick or drop tasks
  const hasPickOrDrop = stops.some((s) => s.actionCode === 'pick' || s.actionCode === 'drop');

  const getVehicleName = (code: string) => {
    const v = vehicleTypes.find((vt) => vt.code === code);
    return v ? v.nameAr : code;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>مراجعة وتأكيد الطلب</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #374151)' }}>
            {stops.length} {stops.length === 1 ? 'مهمة محددة' : 'مهام محددة'}
          </span>
        </div>
        <button
          type="button"
          aria-label="إغلاق مراجعة السلة"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #374151)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Stops list with reorder and delete */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '220px', overflowY: 'auto' }}>
        {stops.map((stop, index) => (
          <div
            key={stop.id}
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--color-chip, #eef3ef)',
              borderRadius: 'var(--radius-sm, 14px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <span
                style={{
                  backgroundColor: 'var(--color-ink, #12302b)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {stop.seq}
              </span>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {stop.actionNameAr}
                  {stop.placeNameAr ? ` - ${stop.placeNameAr}` : ''}
                </div>
                {stop.description && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #374151)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stop.description}
                  </div>
                )}
              </div>
            </div>

            {/* Reorder and Delete controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onReorder(index, index - 1)}
                aria-label="تحريك للأعلى"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: index === 0 ? 'not-allowed' : 'pointer',
                  opacity: index === 0 ? 0.3 : 1,
                  padding: '4px',
                }}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                disabled={index === stops.length - 1}
                onClick={() => onReorder(index, index + 1)}
                aria-label="تحريك للأسفل"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: index === stops.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: index === stops.length - 1 ? 0.3 : 1,
                  padding: '4px',
                }}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteStop(stop.id)}
                aria-label="حذف المهمة"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#dc2626',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add more button */}
      <button
        type="button"
        onClick={onAddMoreStops}
        style={{
          width: '100%',
          height: '42px',
          border: '1.5px dashed var(--color-ink, #12302b)',
          borderRadius: 'var(--radius-sm, 14px)',
          background: 'transparent',
          color: 'var(--color-ink, #12302b)',
          fontWeight: 600,
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          cursor: 'pointer',
        }}
      >
        <Plus size={16} />
        إضافة نقطة أخرى للطلب
      </button>

      {/* Value tier selection */}
      <div>
        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>
          شريحة القيمة المتوقعة للمشتريات/البضائع (ج.م):
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {valueTiers.map((tier) => {
            const isSelected = selectedValueTierId === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => onSelectValueTier(tier.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: isSelected ? '2px solid var(--color-ink, #12302b)' : '1px solid #d1d5db',
                  backgroundColor: isSelected ? 'var(--color-ink, #12302b)' : 'var(--color-sheet, #ffffff)',
                  color: isSelected ? 'var(--color-sheet, #ffffff)' : 'var(--color-ink, #12302b)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tier.nameAr}
              </button>
            );
          })}
        </div>
      </div>

      {/* Wait mode (only if relevant) */}
      {hasPickOrDrop && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--color-accent, #f2a20c)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>انتظر حتى الانتهاء</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #374151)' }}>
                {waitMode === 'wait'
                  ? 'الكابتن سينتظر إنجاز المهمة (أجرة الانتظار محسوبة بالساعة)'
                  : 'الكابتن سيغادر وسيتم إشعارك للعودة لاحقاً'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleWaitMode(waitMode === 'wait' ? 'notify' : 'wait')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: 'none',
              backgroundColor: waitMode === 'wait' ? 'var(--color-ok, #1f8a5b)' : '#d1d5db',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {waitMode === 'wait' ? 'انتظار مفعل' : 'إشعار فقط'}
          </button>
        </div>
      )}

      {/* Suggested vehicle classes */}
      {quote && quote.suggestedVehicleClasses?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted, #374151)' }}>
          <Truck size={16} />
          <span>المركبات المناسبة للطلب:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-ink, #12302b)' }}>
            {quote.suggestedVehicleClasses.map(getVehicleName).join(' أو ')}
          </span>
        </div>
      )}

      {/* Settlement preview: Only min fare shown (never show formula) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <span style={{ fontSize: '1rem', fontWeight: 600 }}>الحد الأدنى لأجرة الكابتن:</span>
        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ok, #1f8a5b)' }}>
          {quote ? quote.formattedFareEgp : formatEgp(26)}
        </span>
      </div>

      {/* Primary button: اطلب */}
      <Button
        variant="primary"
        isLoading={isPublishing}
        onClick={onPublish}
        style={{
          minHeight: '52px',
          height: '56px',
          fontSize: '1.2rem',
          fontWeight: 800,
          backgroundColor: 'var(--color-ink, #12302b)',
        }}
      >
        اطلب
      </Button>
    </div>
  );
};
