import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.js';
import { apiClient } from '../../api.js';
import { DriverAppState } from '../../types/driver.js';
import { compressImageToMaxDimension } from '../../services/image/imageCompressor.js';

interface OnboardingSheetProps {
  state: DriverAppState;
  onProfileUpdated: () => void;
  isLoading?: boolean;
}

export const OnboardingSheet: React.FC<OnboardingSheetProps> = ({
  state,
  onProfileUpdated,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  const [fullName, setFullName] = useState(state.user?.fullName || '');
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [nationalId, setNationalId] = useState('');

  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    apiClient.catalog
      .getUnified()
      .then((data: any) => {
        if (data.vehicleTypes) setVehicleTypes(data.vehicleTypes);
      })
      .catch(() => {
        // Fallback default vehicles
        setVehicleTypes([
          { id: 'v-motorcycle', code: 'motorcycle', nameAr: 'دراجة نارية / موتوسيكل' },
          { id: 'v-tricycle', code: 'tricycle', nameAr: 'تروسيكل' },
          { id: 'v-half-truck', code: 'half_truck', nameAr: 'نصف نقل (بيك آب)' },
          { id: 'v-jumbo', code: 'jumbo', nameAr: 'جامبو / نقل خفيف' },
          { id: 'v-bicycle', code: 'bicycle', nameAr: 'دراجة هوائية' },
        ]);
      });
  }, []);

  const handleDocumentUpload = async (docType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus((prev) => ({ ...prev, [docType]: 'compressing' }));
    try {
      // 1. Client-side image compression to <= 1280px
      const compressedBlob = await compressImageToMaxDimension(file, 1280, 0.8);

      setUploadStatus((prev) => ({ ...prev, [docType]: 'uploading' }));

      // 2. Pre-signed upload URL from API
      const { uploadUrl, key } = await apiClient.driver.getDocumentUploadUrl(file.type || 'image/jpeg');

      // 3. Direct upload to pre-signed URL (or fallback)
      try {
        await fetch(uploadUrl, {
          method: 'PUT',
          body: compressedBlob,
          headers: { 'Content-Type': file.type || 'image/jpeg' },
        });
      } catch {
        console.warn('Pre-signed PUT notice, registering doc metadata');
      }

      // 4. Submit document record
      await apiClient.driver.submitDocument({
        type: docType,
        storageKey: key,
      });

      setUploadStatus((prev) => ({ ...prev, [docType]: 'done' }));
    } catch (err: any) {
      console.error('Doc upload error', err);
      setUploadStatus((prev) => ({ ...prev, [docType]: 'error' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('يرجى إدخال الاسم الكامل كما بالبطاقة');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // Update profile
      await apiClient.auth.updateMe({ fullName: fullName.trim() });

      // Create driver profile if not exists
      try {
        await apiClient.driver.createProfile({});
      } catch {
        // ignore if already exists
      }

      // Register vehicle if selected
      if (vehicleTypeId && plateNumber.trim()) {
        try {
          await apiClient.driver.registerVehicle({
            vehicleTypeId,
            plate: plateNumber.trim(),
          });
        } catch {
          // ignore
        }
      }

      onProfileUpdated();
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          📋 {t('onboarding.title')}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '2px' }}>
          {t('onboarding.subtitle')}
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm, 14px)',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
            {t('onboarding.fullName')} *
          </label>
          <input
            type="text"
            required
            placeholder="مثال: محمد السيد محمود"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{
              width: '100%',
              height: '50px',
              padding: '0 14px',
              fontSize: '1rem',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1.5px solid var(--color-ink, #12302b)',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
            {t('onboarding.vehicleType')}
          </label>
          <select
            value={vehicleTypeId}
            onChange={(e) => setVehicleTypeId(e.target.value)}
            style={{
              width: '100%',
              height: '50px',
              padding: '0 14px',
              fontSize: '0.95rem',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid var(--color-border, #e5e7eb)',
              backgroundColor: 'var(--color-sheet, #ffffff)',
            }}
          >
            <option value="">-- اختر فئة المركبة --</option>
            {vehicleTypes.map((vt) => (
              <option key={vt.id} value={vt.id}>
                {vt.nameAr || vt.code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
            {t('onboarding.plateNumber')}
          </label>
          <input
            type="text"
            placeholder="مثال: ق ن ص ١٢٣٤"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            style={{
              width: '100%',
              height: '50px',
              padding: '0 14px',
              fontSize: '1rem',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid var(--color-border, #e5e7eb)',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px' }}>
            {t('onboarding.nationalId')}
          </label>
          <input
            type="text"
            placeholder="الرقم القومي (14 رقم)"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            style={{
              width: '100%',
              height: '50px',
              padding: '0 14px',
              fontSize: '1rem',
              borderRadius: 'var(--radius-sm, 14px)',
              border: '1px solid var(--color-border, #e5e7eb)',
            }}
          />
        </div>

        {/* Document Uploads with Client-Side Compression */}
        <div
          style={{
            backgroundColor: 'var(--color-chip, #eef3ef)',
            borderRadius: 'var(--radius-sm, 14px)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
            📄 {t('onboarding.documentsTitle')}
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', display: 'block', marginBottom: '2px' }}>
              {t('onboarding.nationalIdPhoto')}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleDocumentUpload('national_id_front', e)}
              style={{ fontSize: '0.8rem' }}
            />
            {uploadStatus.national_id_front === 'uploading' && <span style={{ fontSize: '0.75rem', color: '#b45309' }}> جاري الرفع...</span>}
            {uploadStatus.national_id_front === 'done' && <span style={{ fontSize: '0.75rem', color: 'green' }}> ✓ تم الرفع</span>}
          </div>

          <div>
            <span style={{ fontSize: '0.8rem', display: 'block', marginBottom: '2px' }}>
              {t('onboarding.licensePhoto')}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleDocumentUpload('driver_license', e)}
              style={{ fontSize: '0.8rem' }}
            />
            {uploadStatus.driver_license === 'uploading' && <span style={{ fontSize: '0.75rem', color: '#b45309' }}> جاري الرفع...</span>}
            {uploadStatus.driver_license === 'done' && <span style={{ fontSize: '0.75rem', color: 'green' }}> ✓ تم الرفع</span>}
          </div>
        </div>

        {/* The Single Primary Button (>=56px) */}
        <Button
          type="submit"
          variant="primary"
          isLoading={submitting || isLoading}
          style={{
            minHeight: '56px',
            height: '56px',
            fontSize: '1.15rem',
            marginTop: '8px',
          }}
        >
          {t('onboarding.submit')}
        </Button>
      </form>
    </div>
  );
};
