import React from 'react';
import { AgreementResponseDto, OrderDetailsDto, OrderStopResponseDto } from '@wasel/api-client';
import { Phone, MessageCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface TrackingSheetProps {
  order: OrderDetailsDto;
  agreement: AgreementResponseDto;
  pendingAmendment?: any | null;
  pendingInFlightStop?: any | null;
  onApproveAmendment: (amendmentId: string) => void;
  onRejectAmendment: (amendmentId: string) => void;
  onApproveInFlightStop: (stopId: string) => void;
  onRejectInFlightStop: (stopId: string) => void;
  onOpenChat: () => void;
}

export const TrackingSheet: React.FC<TrackingSheetProps> = ({
  order,
  agreement,
  pendingAmendment,
  pendingInFlightStop,
  onApproveAmendment,
  onRejectAmendment,
  onApproveInFlightStop,
  onRejectInFlightStop,
  onOpenChat,
}) => {
  const stops = order.stops || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Captain Profile Card & Communication Actions */}
      <div
        style={{
          padding: '14px 16px',
          backgroundColor: 'var(--color-chip, #eef3ef)',
          borderRadius: 'var(--radius-md, 18px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>الكابتن المكلف:</span>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-ink, #12302b)' }}>
            الكابتن {agreement.driverName || 'معتمد'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-ok, #1f8a5b)', fontWeight: 700, marginTop: '2px' }}>
            الأجرة المتفق عليها: {agreement.formattedAgreedFareEgp || formatEgp(agreement.agreedFareMinor / 100)}
          </div>
        </div>

        {/* Call and Chat Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {agreement.driverPhone ? (
            <a
              href={`tel:${agreement.driverPhone}`}
              aria-label="اتصال هاتفي بالكابتن"
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-ok, #1f8a5b)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(31, 138, 91, 0.25)',
              }}
            >
              <Phone size={20} />
            </a>
          ) : null}

          <button
            type="button"
            onClick={onOpenChat}
            aria-label="محادثة داخل التطبيق مع الكابتن"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-ink, #12302b)',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(18, 48, 43, 0.25)',
            }}
          >
            <MessageCircle size={20} />
          </button>
        </div>
      </div>

      {/* In-flight stop approval banner */}
      {pendingInFlightStop && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            backgroundColor: '#fef3c7',
            border: '1.5px solid #f59e0b',
            borderRadius: 'var(--radius-sm, 14px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#92400e' }}>
            <AlertCircle size={18} />
            السائق أضاف زيارة إضافية للمسار:
          </div>
          <div style={{ fontSize: '0.85rem', color: '#78350f' }}>
            {pendingInFlightStop.description || pendingInFlightStop.placeNameAr || 'محطة إضافية مقترحة'}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => onApproveInFlightStop(pendingInFlightStop.id)}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--color-ok, #1f8a5b)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              موافقة
            </button>
            <button
              type="button"
              onClick={() => onRejectInFlightStop(pendingInFlightStop.id)}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#dc2626',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              رفض
            </button>
          </div>
        </div>
      )}

      {/* Amendment approval banner */}
      {pendingAmendment && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            backgroundColor: '#e0f2fe',
            border: '1.5px solid #0284c7',
            borderRadius: 'var(--radius-sm, 14px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#0369a1' }}>
            <AlertCircle size={18} />
            مقترح ملحق تعديل للاتفاق:
          </div>
          <div style={{ fontSize: '0.85rem', color: '#0c4a6e' }}>
            {pendingAmendment.reason}
            {pendingAmendment.newFareMinor && (
              <span style={{ display: 'block', fontWeight: 700, marginTop: '2px' }}>
                الأجرة الجديدة المقترحة: {formatEgp(pendingAmendment.newFareMinor / 100)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => onApproveAmendment(pendingAmendment.id)}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--color-ok, #1f8a5b)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              اعتماد الملحق
            </button>
            <button
              type="button"
              onClick={() => onRejectAmendment(pendingAmendment.id)}
              style={{
                flex: 1,
                height: '40px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#dc2626',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              رفض
            </button>
          </div>
        </div>
      )}

      {/* Timeline of Stops */}
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px' }}>خط سير المشوار:</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stops.map((stop: OrderStopResponseDto, index: number) => {
            const isCompleted = stop.status === 'completed';
            const isArrived = stop.status === 'arrived' || stop.status === 'in_progress';
            const isCurrent = !isCompleted && (isArrived || index === 0 || stops[index - 1]?.status === 'completed');

            return (
              <div
                key={stop.id}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: isCurrent ? '2px solid var(--color-ink, #12302b)' : '1px solid #e5e7eb',
                  backgroundColor: isCurrent ? 'var(--color-chip, #eef3ef)' : 'var(--color-sheet, #ffffff)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: isCompleted
                        ? 'var(--color-ok, #1f8a5b)'
                        : isCurrent
                        ? 'var(--color-accent, #f2a20c)'
                        : '#9ca3af',
                      color: isCurrent && !isCompleted ? '#12302b' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                    }}
                  >
                    {isCompleted ? <CheckCircle size={14} /> : stop.seq}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {stop.actionNameAr || 'محطة'}
                      {stop.placeNameAr ? ` - ${stop.placeNameAr}` : ''}
                    </div>
                    {stop.description && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{stop.description}</div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: isCompleted ? 'var(--color-ok, #1f8a5b)' : isCurrent ? '#d97706' : '#6b7280',
                  }}
                >
                  {isCompleted ? 'مكتملة' : isArrived ? 'وصل الكابتن' : isCurrent ? 'قيد التوجه' : 'في الانتظار'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
