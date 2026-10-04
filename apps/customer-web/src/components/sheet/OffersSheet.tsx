import React, { useState } from 'react';
import { OfferResponseDto } from '@wasel/api-client';
import { Button } from '../ui/Button.js';
import { Star, Truck, Check, X, ArrowLeftRight } from 'lucide-react';
import { formatEgp } from '@wasel/shared';

interface OffersSheetProps {
  offers: OfferResponseDto[];
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onCounter: (offerId: string, counterAmountMinor: number, notes?: string) => void;
  isProcessing: boolean;
}

export const OffersSheet: React.FC<OffersSheetProps> = ({
  offers,
  onAccept,
  onReject,
  onCounter,
  isProcessing,
}) => {
  const [activeCounterOfferId, setActiveCounterOfferId] = useState<string | null>(null);
  const [counterFareEgp, setCounterFareEgp] = useState<string>('');

  const handleSendCounter = (offerId: string) => {
    const egp = parseFloat(counterFareEgp);
    if (!isNaN(egp) && egp > 0) {
      onCounter(offerId, Math.round(egp * 100));
      setActiveCounterOfferId(null);
      setCounterFareEgp('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>عروض الكباتن المتاحة</h3>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          وصلك {offers.length} {offers.length === 1 ? 'عرض' : 'عروض'}. يمكنك قبول العرض الأنسب أو تقديم سعر مقابل.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
        {offers.map((offer) => {
          const isCountering = activeCounterOfferId === offer.id;

          return (
            <div
              key={offer.id}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md, 18px)',
                border: '1.5px solid var(--color-ink, #12302b)',
                backgroundColor: 'var(--color-sheet, #ffffff)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              }}
            >
              {/* Top row: Captain Info & Rating */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-ink, #12302b)' }}>
                    الكابتن {offer.driverName || 'معتمد'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#f59e0b', fontSize: '0.85rem' }}>
                      <Star size={14} fill="#f59e0b" />
                      <span style={{ fontWeight: 700 }}>{offer.driverRatingAvg ? offer.driverRatingAvg.toFixed(1) : '5.0'}</span>
                    </div>
                    {offer.driverVehicleType && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#6b7280' }}>
                        <Truck size={14} />
                        <span>{offer.driverVehicleType}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Offered Fare */}
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>الأجرة المعروضة</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-ok, #1f8a5b)' }}>
                    {offer.formattedFareEgp || formatEgp(offer.offeredFareMinor / 100)}
                  </span>
                </div>
              </div>

              {/* Note if any */}
              {offer.notes && (
                <div style={{ fontSize: '0.85rem', color: '#4b5563', backgroundColor: 'var(--color-chip, #eef3ef)', padding: '6px 10px', borderRadius: '8px' }}>
                  "{offer.notes}"
                </div>
              )}

              {/* Counter offer input field if toggled */}
              {isCountering ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <input
                    type="number"
                    value={counterFareEgp}
                    onChange={(e) => setCounterFareEgp(e.target.value)}
                    placeholder="أدخل سعرك المقترح (ج.م)"
                    aria-label="السعر المقترح"
                    style={{
                      flex: 1,
                      height: '46px',
                      padding: '0 12px',
                      borderRadius: 'var(--radius-sm, 14px)',
                      border: '1.5px solid #d1d5db',
                      fontFamily: 'var(--font-family)',
                      fontSize: '0.95rem',
                      outline: 'none',
                    }}
                  />
                  <Button
                    variant="primary"
                    isLoading={isProcessing}
                    onClick={() => handleSendCounter(offer.id)}
                    style={{ minHeight: '46px', height: '46px', width: 'auto', padding: '0 16px', fontSize: '0.9rem' }}
                  >
                    إرسال
                  </Button>
                  <button
                    type="button"
                    onClick={() => setActiveCounterOfferId(null)}
                    style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '6px' }}
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                /* Primary & Secondary Action buttons */
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                  <Button
                    variant="primary"
                    disabled={isProcessing}
                    onClick={() => onAccept(offer.id)}
                    style={{ minHeight: '48px', height: '48px', fontWeight: 800, fontSize: '0.95rem', backgroundColor: 'var(--color-ok, #1f8a5b)' }}
                  >
                    <Check size={16} style={{ marginLeft: '4px' }} />
                    اقبل
                  </Button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setActiveCounterOfferId(offer.id);
                      setCounterFareEgp(String(Math.round(offer.offeredFareMinor / 100)));
                    }}
                    style={{
                      minHeight: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-sm, 14px)',
                      border: '1.5px solid var(--color-ink, #12302b)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-ink, #12302b)',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <ArrowLeftRight size={14} />
                    فاوض
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onReject(offer.id)}
                    style={{
                      minHeight: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-sm, 14px)',
                      border: '1px solid #d1d5db',
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
                    <X size={14} />
                    رفض
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
