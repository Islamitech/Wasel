import React, { useState } from 'react';
import { AgreementResponseDto, InvoiceResponseDto } from '@wasel/api-client';
import { Button } from '../ui/Button.js';
import { Star, CheckCircle, RefreshCw } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface DoneSheetProps {
  agreement: AgreementResponseDto | null;
  invoices: InvoiceResponseDto[];
  onSubmitRating: (score: number, comment: string) => void;
  onNewOrder: () => void;
  isSubmittingRating: boolean;
}

export const DoneSheet: React.FC<DoneSheetProps> = ({
  agreement,
  invoices,
  onSubmitRating,
  onNewOrder,
  isSubmittingRating,
}) => {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [hasRated, setHasRated] = useState(false);

  // Two-line settlement calculation
  const totalInvoicesMinor = invoices.reduce((sum, inv) => sum + (inv.amountMinor || 0), 0);
  const driverFareMinor = agreement?.agreedFareMinor || 2600;
  const grandTotalMinor = totalInvoicesMinor + driverFareMinor;

  const handleRatingSubmit = () => {
    onSubmitRating(score, comment);
    setHasRated(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '10px 0' }}>
      {/* Success Badge */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#dcfce7',
          color: 'var(--color-ok, #1f8a5b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}
      >
        <CheckCircle size={36} />
      </div>

      <div>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 800 }}>تم اكتمال المشوار بنجاح</h3>
        <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
          شكراً لاستخدامك منصة واصل في حدائق الأهرام!
        </p>
      </div>

      {/* Non-negotiable Two-Line Settlement */}
      <div
        style={{
          padding: '16px',
          backgroundColor: 'var(--color-chip, #eef3ef)',
          borderRadius: 'var(--radius-md, 18px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          textAlign: 'right',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '4px', borderBottom: '1px solid #d1d5db', paddingBottom: '6px' }}>
          تفاصيل الحساب النهائي (تسوية مباشرة نقداً):
        </div>

        {/* Line 1: Invoices total (paid to seller) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
          <span style={{ color: '#4b5563' }}>قيمة المشتريات (مسددة للمتجر):</span>
          <span style={{ fontWeight: 700, color: 'var(--color-ink, #12302b)' }}>
            {formatEgp(totalInvoicesMinor / 100)}
          </span>
        </div>

        {/* Line 2: Driver Fare */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
          <span style={{ color: '#4b5563' }}>أجرة الكابتن:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-ink, #12302b)' }}>
            {formatEgp(driverFareMinor / 100)}
          </span>
        </div>

        {/* Grand Total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '1.15rem',
            fontWeight: 800,
            borderTop: '1.5px solid #d1d5db',
            paddingTop: '8px',
            marginTop: '4px',
          }}
        >
          <span>الإجمالي المسدد نقداً:</span>
          <span style={{ color: 'var(--color-ok, #1f8a5b)' }}>
            {formatEgp(grandTotalMinor / 100)}
          </span>
        </div>
      </div>

      {/* 1-5 Star Rating */}
      {!hasRated ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>قيّم تجربة الكابتن:</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setScore(star)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <Star
                  size={32}
                  fill={star <= score ? '#f59e0b' : 'none'}
                  color={star <= score ? '#f59e0b' : '#9ca3af'}
                />
              </button>
            ))}
          </div>

          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="اكتب كلمة شكر أو ملاحظة للكابتن (اختياري)..."
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid #d1d5db',
              fontFamily: 'var(--font-family)',
              fontSize: '0.9rem',
              resize: 'none',
              outline: 'none',
            }}
          />

          <Button
            variant="secondary"
            isLoading={isSubmittingRating}
            onClick={handleRatingSubmit}
            style={{ minHeight: '46px', height: '46px', fontSize: '0.95rem', fontWeight: 700 }}
          >
            إرسال التقييم
          </Button>
        </div>
      ) : (
        <div style={{ color: 'var(--color-ok, #1f8a5b)', fontWeight: 700, fontSize: '0.9rem' }}>
          تم استلام تقييمك، شكراً لمساهمتك في موثوقية المنصة!
        </div>
      )}

      {/* Primary button: طلب جديد */}
      <Button
        variant="primary"
        onClick={onNewOrder}
        style={{
          minHeight: '52px',
          height: '56px',
          fontSize: '1.15rem',
          fontWeight: 800,
          backgroundColor: 'var(--color-ink, #12302b)',
          marginTop: '8px',
        }}
      >
        <RefreshCw size={18} style={{ marginLeft: '6px' }} />
        طلب جديد
      </Button>
    </div>
  );
};
