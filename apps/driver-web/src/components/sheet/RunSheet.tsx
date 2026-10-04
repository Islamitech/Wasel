import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { DriverAppState, RunStopPhase } from '../../types/driver.js';
import { compressImageToMaxDimension } from '../../services/image/imageCompressor.js';

interface RunSheetProps {
  state: DriverAppState;
  onArrive: () => void;
  onStartWait: () => void;
  onEndWait: () => void;
  onIssueInvoice: (dto: { invoiceNumber: string; amountMinor: number; photoBlob?: Blob; notes?: string }) => void;
  onPaymentConfirmed: () => void;
  onCompleteStop: () => void;
  onCompleteAgreement: () => void;
  onOpenChat: () => void;
  onOpenCancelModal: () => void;
  onAddInFlightStop: (description: string, expectedDurationMinutes?: number) => void;
  isLoading?: boolean;
}

export const RunSheet: React.FC<RunSheetProps> = ({
  state,
  onArrive,
  onStartWait,
  onEndWait,
  onIssueInvoice,
  onPaymentConfirmed,
  onCompleteStop,
  onCompleteAgreement,
  onOpenChat,
  onOpenCancelModal,
  onAddInFlightStop,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const agreement = state.activeAgreement;
  const stops = agreement?.order?.stops || (agreement?.agreementSnapshot as any)?.stops || [];
  const currentStop = stops[state.currentStopIndex];
  const isLastStop = state.currentStopIndex >= stops.length - 1;

  // Invoice Entry State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amountEgp, setAmountEgp] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<Blob | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  // In-Flight Stop State
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [newStopDesc, setNewStopDesc] = useState('');

  // Waiting elapsed timer
  const [elapsedWaitSeconds, setElapsedWaitSeconds] = useState(0);

  useEffect(() => {
    if (state.currentStopPhase === 'waiting' && state.waitStartTime) {
      const interval = setInterval(() => {
        const secs = Math.floor((Date.now() - state.waitStartTime!) / 1000);
        setElapsedWaitSeconds(secs);
      }, 1000);
      return () => clearInterval(interval);
    }
    setElapsedWaitSeconds(0);
    return undefined;
  }, [state.currentStopPhase, state.waitStartTime]);

  const formatElapsedWait = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingPhoto(true);
    try {
      const compressed = await compressImageToMaxDimension(file, 1280, 0.8);
      setSelectedPhoto(compressed);
    } catch (err) {
      console.warn('Compression failed, using original file', err);
      setSelectedPhoto(file);
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(amountEgp);
    if (!amountVal || amountVal <= 0) return;

    onIssueInvoice({
      invoiceNumber: invoiceNumber.trim() || `INV-${Date.now().toString().slice(-4)}`,
      amountMinor: Math.round(amountVal * 100),
      photoBlob: selectedPhoto || undefined,
      notes: invoiceNotes.trim() || undefined,
    });

    setShowInvoiceModal(false);
    setInvoiceNumber('');
    setAmountEgp('');
    setInvoiceNotes('');
    setSelectedPhoto(null);
  };

  const handleAddStopSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStopDesc.trim()) return;
    onAddInFlightStop(newStopDesc.trim());
    setShowAddStopModal(false);
    setNewStopDesc('');
  };

  // Customer phone number (revealed after agreement!)
  const customerPhone =
    agreement?.customerPhone ||
    agreement?.order?.customerPhone ||
    (agreement?.agreementSnapshot as any)?.customerPhone ||
    '';

  // Determine what the single primary button does based on phase
  const renderPrimaryActionButton = () => {
    const phase: RunStopPhase = state.currentStopPhase;
    const isWaitMode = (agreement?.order?.waitMode || (agreement?.agreementSnapshot as any)?.waitMode) === 'wait';
    const isInvoiceRequired = currentStop?.invoiceRequired !== false;

    switch (phase) {
      case 'to_stop':
        return (
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={onArrive}
            style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
          >
            📍 {t('run.actions.arrive')}
          </Button>
        );

      case 'at_stop':
        if (isWaitMode) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button
                variant="accent"
                isLoading={isLoading}
                onClick={onStartWait}
                style={{ minHeight: '56px', height: '56px', fontSize: '1.1rem' }}
              >
                ⏱️ {t('run.actions.startWait')}
              </Button>
              {isInvoiceRequired ? (
                <Button
                  variant="outline"
                  onClick={() => setShowInvoiceModal(true)}
                  style={{ minHeight: '56px', height: '56px' }}
                >
                  🧾 {t('run.actions.issueInvoice')}
                </Button>
              ) : (
                <Button
                  variant="success"
                  onClick={onPaymentConfirmed}
                  style={{ minHeight: '56px', height: '56px' }}
                >
                  ✓ {t('run.actions.completeStop')}
                </Button>
              )}
            </div>
          );
        }

        // Short path for non-wait orders
        if (isInvoiceRequired) {
          return (
            <Button
              variant="accent"
              isLoading={isLoading}
              onClick={() => setShowInvoiceModal(true)}
              style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
            >
              🧾 {t('run.actions.issueInvoice')}
            </Button>
          );
        } else {
          return (
            <Button
              variant="success"
              isLoading={isLoading}
              onClick={onPaymentConfirmed}
              style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
            >
              ✓ {t('run.actions.completeStop')}
            </Button>
          );
        }

      case 'waiting':
        return (
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={onEndWait}
            style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
          >
            ⏹️ {t('run.actions.endWait')} ({formatElapsedWait(elapsedWaitSeconds)})
          </Button>
        );

      case 'invoice_entry':
        return (
          <Button
            variant="accent"
            onClick={() => setShowInvoiceModal(true)}
            style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
          >
            🧾 {t('run.actions.issueInvoice')}
          </Button>
        );

      case 'payment_pending':
        return (
          <Button
            variant="success"
            isLoading={isLoading}
            onClick={onPaymentConfirmed}
            style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
          >
            💵 {t('run.actions.paymentRecorded')}
          </Button>
        );

      case 'stop_completed':
        if (isLastStop) {
          return (
            <Button
              variant="success"
              isLoading={isLoading}
              onClick={onCompleteAgreement}
              style={{ minHeight: '56px', height: '56px', fontSize: '1.2rem', fontWeight: 800 }}
            >
              🏁 {t('run.actions.completeAgreement')}
            </Button>
          );
        }
        return (
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={onCompleteStop}
            style={{ minHeight: '56px', height: '56px', fontSize: '1.15rem' }}
          >
            ➡️ {t('run.actions.nextStop')}
          </Button>
        );

      default:
        return null;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '20px',
      }}
    >
      {/* Top Bar: WakeLock indicator & Current Stop Number */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
          paddingBottom: '10px',
        }}
      >
        <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
          {t('run.currentStop', {
            current: (state.currentStopIndex || 0) + 1,
            total: stops.length,
          })}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {state.isWakeLockActive && (
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                padding: '4px 8px',
                borderRadius: '8px',
                fontWeight: 600,
              }}
            >
              💡 {t('driver.wakeLockActive')}
            </span>
          )}
          <Chip label="قيد التنفيذ 🛵" variant="accent" />
        </div>
      </div>

      {/* Current Stop Card */}
      <div
        style={{
          backgroundColor: 'var(--color-chip, #eef3ef)',
          borderRadius: 'var(--radius-md, 18px)',
          padding: '16px',
          border: '1.5px solid var(--color-ink, #12302b)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-accent, #f2a20c)',
              color: '#12302b',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
            }}
          >
            {(state.currentStopIndex || 0) + 1}
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
            {currentStop?.actionNameAr || currentStop?.action?.nameAr || 'محطة مهمة'}
          </span>
        </div>

        {currentStop?.placeNameAr && (
          <div style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '4px' }}>
            📍 {currentStop.placeNameAr}
          </div>
        )}

        {currentStop?.addressLabel && (
          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>
            {currentStop.addressLabel}
          </div>
        )}

        {currentStop?.notes && (
          <div
            style={{
              backgroundColor: 'var(--color-sheet, #ffffff)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 14px)',
              fontSize: '0.85rem',
              marginTop: '6px',
              border: '1px solid var(--color-border, #e5e7eb)',
            }}
          >
            📝 <strong>ملاحظات العميل:</strong> {currentStop.notes}
          </div>
        )}

        {/* Phase Badge */}
        <div style={{ marginTop: '10px' }}>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color:
                state.currentStopPhase === 'waiting'
                  ? '#b45309'
                  : state.currentStopPhase === 'at_stop'
                  ? 'var(--color-ok)'
                  : '#4b5563',
            }}
          >
            الحالة:{' '}
            {state.currentStopPhase === 'to_stop'
              ? 'في الطريق إلى المحطة'
              : state.currentStopPhase === 'at_stop'
              ? 'وصلت إلى المحطة'
              : state.currentStopPhase === 'waiting'
              ? `الانتظار جاري (${formatElapsedWait(elapsedWaitSeconds)})`
              : state.currentStopPhase === 'payment_pending'
              ? 'تم تسجيل الفاتورة وبانتظار تحصيل الكاش'
              : 'تمت المحطة'}
          </span>
        </div>
      </div>

      {/* Customer Contact Bar (Revealed now that agreement exists) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}
      >
        <a
          href={customerPhone ? `tel:${customerPhone}` : '#'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '10px',
            color: 'var(--color-ink)',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
            border: '1px solid var(--color-border, #e5e7eb)',
          }}
        >
          📞 {t('run.callCustomer')}
        </a>

        <button
          type="button"
          onClick={onOpenChat}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '10px',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border, #e5e7eb)',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          💬 {t('run.chatCustomer')}
        </button>
      </div>

      {/* In-Flight amendment / Add stop buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
        }}
      >
        <button
          type="button"
          onClick={() => setShowAddStopModal(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-accent, #f2a20c)',
            cursor: 'pointer',
            fontWeight: 700,
            textDecoration: 'underline',
          }}
        >
          + {t('run.addStop')}
        </button>

        <button
          type="button"
          onClick={onOpenCancelModal}
          style={{
            background: 'none',
            border: 'none',
            color: '#d32f2f',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('run.cancelTrip')}
        </button>
      </div>

      {/* THE SINGLE PRIMARY ACTION BUTTON (>=56px, Bottom-Anchored) */}
      <div style={{ marginTop: '8px' }}>
        {renderPrimaryActionButton()}
      </div>

      {/* Modal: Store Invoice Entry */}
      {showInvoiceModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-sheet, #ffffff)',
              width: '100%',
              borderRadius: '24px 24px 0 0',
              padding: '24px 20px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>
              🧾 {t('run.invoiceModal.title')}
            </h3>

            <form onSubmit={handleInvoiceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                  {t('run.invoiceModal.amountEgp')} *
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="160"
                  value={amountEgp}
                  onChange={(e) => setAmountEgp(e.target.value)}
                  style={{
                    width: '100%',
                    height: '52px',
                    padding: '0 16px',
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm, 14px)',
                    border: '2px solid var(--color-ink, #12302b)',
                    direction: 'ltr',
                    textAlign: 'right',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                  {t('run.invoiceModal.invoiceNumber')}
                </label>
                <input
                  type="text"
                  placeholder="INV-1092"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  style={{
                    width: '100%',
                    height: '48px',
                    padding: '0 14px',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius-sm, 14px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                  ملاحظات الفاتورة (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="تفاصيل مشتريات أو إيصال..."
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  style={{
                    width: '100%',
                    height: '48px',
                    padding: '0 14px',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius-sm, 14px)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
                  {t('run.invoiceModal.takePhoto')}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    fontSize: '0.9rem',
                  }}
                />
                {isCompressingPhoto && (
                  <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
                    جاري ضغط ومعالجة الصورة...
                  </div>
                )}
                {selectedPhoto && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ok, #1f8a5b)' }}>
                    ✓ تم اختيار الصورة ({Math.round(selectedPhoto.size / 1024)} ك.ب)
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <Button
                  type="submit"
                  variant="success"
                  style={{ minHeight: '56px', height: '56px', fontSize: '1.1rem' }}
                >
                  {t('run.invoiceModal.submit')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowInvoiceModal(false)}
                  style={{ minHeight: '56px', height: '56px', width: '35%' }}
                >
                  {t('run.invoiceModal.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: In-Flight Stop Request */}
      {showAddStopModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-sheet, #ffffff)',
              width: '100%',
              borderRadius: '24px 24px 0 0',
              padding: '24px 20px',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '14px' }}>
              📍 {t('run.addStop')}
            </h3>
            <form onSubmit={handleAddStopSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                required
                placeholder="وصف المحطة الإضافية (مثال: صيدلية 19011)"
                value={newStopDesc}
                onChange={(e) => setNewStopDesc(e.target.value)}
                style={{
                  width: '100%',
                  height: '50px',
                  padding: '0 14px',
                  fontSize: '1rem',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: '1.5px solid var(--color-ink, #12302b)',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <Button
                  type="submit"
                  variant="accent"
                  style={{ minHeight: '56px', height: '56px' }}
                >
                  إرسال للعميل للاعتماد
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddStopModal(false)}
                  style={{ minHeight: '56px', height: '56px', width: '35%' }}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
