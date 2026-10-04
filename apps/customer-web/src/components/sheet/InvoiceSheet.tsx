import React, { useState } from 'react';
import { InvoiceResponseDto } from '@wasel/api-client';
import { Button } from '../ui/Button.js';
import { Check, AlertTriangle, FileText, Info } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface InvoiceSheetProps {
  invoices: InvoiceResponseDto[];
  onConfirmPayment: (invoiceId: string, amountMinor: number) => void;
  onDispute: (invoiceId: string, reason: string) => void;
  isProcessing: boolean;
}

export const InvoiceSheet: React.FC<InvoiceSheetProps> = ({
  invoices,
  onConfirmPayment,
  onDispute,
  isProcessing,
}) => {
  const [disputingInvoiceId, setDisputingInvoiceId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const handleDisputeSubmit = (invoiceId: string) => {
    if (disputeReason.trim().length >= 3) {
      onDispute(invoiceId, disputeReason);
      setDisputingInvoiceId(null);
      setDisputeReason('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>فواتير المشتريات المسجلة</h3>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          قام الكابتن برفع فواتير الشراء المسددة في المتاجر لإثبات القيمة.
        </span>
      </div>

      {/* Non-negotiable principle notice */}
      <div
        style={{
          padding: '12px 14px',
          backgroundColor: '#eff6ff',
          border: '1.5px solid #3b82f6',
          borderRadius: 'var(--radius-sm, 14px)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#1e40af',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        <Info size={18} style={{ flexShrink: 0 }} />
        <span>تنبيه هام: المحاسبة نقدية مباشرة مع المتجر أو الكابتن؛ المنصة توثق القرائن فقط ولا تعالج أي أموال.</span>
      </div>

      {/* Invoices List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
        {invoices.map((inv) => {
          const isDisputing = disputingInvoiceId === inv.id;

          return (
            <div
              key={inv.id}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md, 18px)',
                border: '1.5px solid #d1d5db',
                backgroundColor: 'var(--color-sheet, #ffffff)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="var(--color-ink, #12302b)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      فاتورة {inv.invoiceNumber || 'شراء'}
                    </div>
                    {inv.customerNote && (
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{inv.customerNote}</div>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>المبلغ</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-ink, #12302b)' }}>
                    {inv.formattedAmountEgp || formatEgp(inv.amountMinor / 100)}
                  </span>
                </div>
              </div>

              {/* Photo preview if present */}
              {inv.photoKey && (
                <div style={{ width: '100%', height: '140px', borderRadius: 'var(--radius-sm, 14px)', overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
                  <img
                    src={inv.photoKey.startsWith('http') ? inv.photoKey : `https://images.unsplash.com/photo-1554415707-9e49017a1430?w=600&auto=format&fit=crop&q=60`}
                    alt="صورة الفاتورة"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Verified Badge or Confirmation Actions */}
              {inv.verifiedByCustomer ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm, 14px)',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  <Check size={16} />
                  تم تأكيد الفاتورة وتسجيل السداد
                </div>
              ) : isDisputing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="اكتب سبب الاعتراض بالتفصيل..."
                    style={{
                      height: '44px',
                      padding: '0 12px',
                      borderRadius: 'var(--radius-sm, 14px)',
                      border: '1.5px solid #dc2626',
                      fontFamily: 'var(--font-family)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                      variant="danger"
                      isLoading={isProcessing}
                      onClick={() => handleDisputeSubmit(inv.id)}
                      style={{ minHeight: '44px', height: '44px', fontSize: '0.85rem' }}
                    >
                      تأكيد الاعتراض
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setDisputingInvoiceId(null)}
                      style={{ minHeight: '44px', height: '44px', fontSize: '0.85rem' }}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <Button
                    variant="primary"
                    disabled={isProcessing}
                    onClick={() => onConfirmPayment(inv.id, inv.amountMinor)}
                    style={{ minHeight: '48px', height: '48px', fontWeight: 700, fontSize: '0.95rem', backgroundColor: 'var(--color-ok, #1f8a5b)' }}
                  >
                    <Check size={16} style={{ marginLeft: '4px' }} />
                    تأكيد السداد
                  </Button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setDisputingInvoiceId(inv.id)}
                    style={{
                      minHeight: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-sm, 14px)',
                      border: '1.5px solid #d1d5db',
                      backgroundColor: 'transparent',
                      color: '#dc2626',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <AlertTriangle size={14} />
                    اعتراض
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
