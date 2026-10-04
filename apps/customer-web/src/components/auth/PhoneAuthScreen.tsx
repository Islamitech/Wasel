import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { Toast } from '../ui/Toast.js';
import { UserRole } from '@wasel/shared';

interface PhoneAuthScreenProps {
  onSuccess: (user: any) => void;
  role?: UserRole;
}

export const PhoneAuthScreen: React.FC<PhoneAuthScreenProps> = ({
  onSuccess,
  role = UserRole.CUSTOMER,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError(t('auth.phoneLabel') + ' مطلوب');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.auth.requestOtp(phone, role);
      setToast({ message: res.message || 'تم إرسال رمز التحقق', type: 'ok' });
      setCooldown(res.resendCooldownSeconds || 60);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'فشل إرسال رمز التحقق');
      setToast({ message: err.message || 'فشل إرسال رمز التحقق', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('رمز التحقق يجب أن يتكون من 6 أرقام');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.auth.verifyOtp(phone, otp, 'Customer PWA', role);
      localStorage.setItem('wasel_access_token', res.accessToken);
      localStorage.setItem('wasel_refresh_token', res.refreshToken);
      localStorage.setItem('wasel_user', JSON.stringify(res.user));
      setToast({ message: 'تم تسجيل الدخول بنجاح', type: 'ok' });
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'رمز التحقق غير صالح');
      setToast({ message: err.message || 'رمز التحقق غير صالح', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px',
        maxWidth: '440px',
        margin: '0 auto',
      }}
    >
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: 'var(--color-ink, #12302b)',
            color: 'var(--color-accent, #f2a20c)',
            borderRadius: 'var(--radius-lg, 24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            fontWeight: 800,
            margin: '0 auto 16px auto',
          }}
        >
          و
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          {t('appName')}
        </h1>
        <p style={{ color: 'var(--color-text-muted, #374151)', marginTop: '6px', fontSize: '0.95rem' }}>
          {step === 'phone' ? t('auth.phoneSubtitle') : t('auth.otpSubtitle', { phone })}
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Field
            label={t('auth.phoneLabel')}
            type="tel"
            placeholder="01012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={error || undefined}
            autoFocus
          />

          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #374151)', marginTop: '-12px' }}>
            💡 رقم موبايل مصري مكون من 11 رقماً (مثال: <code>01012345678</code> أو <code>01111445555</code>)
          </div>

          <Button type="submit" isLoading={loading}>
            {t('auth.sendOtp')}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Field
            label={t('auth.otpLabel')}
            type="tel"
            maxLength={6}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            error={error || undefined}
            autoFocus
          />

          {import.meta.env.DEV && (
            <div
              style={{
                fontSize: '0.85rem',
                backgroundColor: '#eaf2ee',
                color: '#12302b',
                padding: '10px',
                borderRadius: '10px',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              🔑 رمز التحقق لبيئة التطوير: <code>123456</code>
            </div>
          )}

          <Button type="submit" isLoading={loading}>
            {t('auth.verifyOtp')}
          </Button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
            <button
              type="button"
              disabled={cooldown > 0}
              onClick={handleRequestOtp}
              style={{
                background: 'none',
                border: 'none',
                color: cooldown > 0 ? '#9ca3af' : 'var(--color-ink)',
                cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendOtp')}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted, #374151)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('auth.changePhone')}
            </button>
          </div>
        </form>
      )}
    </main>
  );
};
