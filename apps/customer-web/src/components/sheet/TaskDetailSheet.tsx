import React, { useState, Suspense, lazy } from 'react';
import { CartStopItem } from '../../types/customer.js';
import { Button } from '../ui/Button.js';
import { Camera, X } from 'lucide-react';

const VoiceRecorder = lazy(() => import('../task/VoiceRecorder.js').then((m) => ({ default: m.VoiceRecorder })));

interface TaskDetailSheetProps {
  draftStop: Partial<CartStopItem>;
  onUpdateDraft: (updates: Partial<CartStopItem>) => void;
  onAddAndContinue: () => void;
  onAddAndFinish: () => void;
  onCancel: () => void;
}

export const TaskDetailSheet: React.FC<TaskDetailSheetProps> = ({
  draftStop,
  onUpdateDraft,
  onAddAndContinue,
  onAddAndFinish,
  onCancel,
}) => {
  const [description, setDescription] = useState(draftStop.description || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(draftStop.photoUrl || null);

  const handleDescriptionChange = (text: string) => {
    setDescription(text);
    onUpdateDraft({ description: text });
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
      onUpdateDraft({ photoFile: file, photoUrl: url });
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    onUpdateDraft({ photoFile: null, photoUrl: null });
  };

  const handleVoiceRecorded = (blob: Blob, url: string) => {
    onUpdateDraft({ voiceBlob: blob, voiceUrl: url });
  };

  const handleVoiceClear = () => {
    onUpdateDraft({ voiceBlob: null, voiceUrl: null });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'var(--color-chip, #eef3ef)',
              color: 'var(--color-ink, #12302b)',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            المهمة رقم {draftStop.seq || 1}
          </span>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '4px' }}>
            {draftStop.actionNameAr}
            {draftStop.placeNameAr ? ` - ${draftStop.placeNameAr}` : ''}
          </h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Description textarea */}
      <div>
        <label
          htmlFor="task-desc"
          style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}
        >
          تفاصيل المطلوب (نص):
        </label>
        <textarea
          id="task-desc"
          rows={3}
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="اكتب ما تحتاجه بدقة (مثلاً: جبن رومي ربع كيلو، لبن معقم، وخبز فينو)..."
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm, 14px)',
            border: '1.5px solid #d1d5db',
            fontFamily: 'var(--font-family)',
            fontSize: '0.95rem',
            backgroundColor: 'var(--color-sheet, #ffffff)',
            color: 'var(--color-ink, #12302b)',
            resize: 'none',
            outline: 'none',
          }}
        />
      </div>

      {/* Voice Recorder */}
      <Suspense fallback={<div style={{ height: '44px' }} />}>
        <VoiceRecorder
          existingUrl={draftStop.voiceUrl}
          onRecorded={handleVoiceRecorded}
          onClear={handleVoiceClear}
        />
      </Suspense>

      {/* Photo attachment */}
      <div>
        {!photoPreview ? (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              height: '46px',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1.5px dashed #9ca3af',
              backgroundColor: 'transparent',
              color: '#4b5563',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Camera size={18} />
            إرفاق صورة للطلب أو الروشتة أو الغرض
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
          </label>
        ) : (
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              width: '100%',
              borderRadius: 'var(--radius-sm, 14px)',
              overflow: 'hidden',
              maxHeight: '140px',
            }}
          >
            <img
              src={photoPreview}
              alt="صورة مرفقة"
              style={{ width: '100%', height: '140px', objectFit: 'cover' }}
            />
            <button
              type="button"
              onClick={handleRemovePhoto}
              aria-label="حذف الصورة"
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Dual action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        <Button
          variant="primary"
          onClick={onAddAndFinish}
          style={{ minHeight: '52px', height: '54px', fontWeight: 700, fontSize: '1.05rem' }}
        >
          أكمل الطلب
        </Button>
        <Button
          variant="secondary"
          onClick={onAddAndContinue}
          style={{ minHeight: '52px', height: '52px', fontWeight: 600 }}
        >
          أضف مكاناً آخر
        </Button>
      </div>
    </div>
  );
};
