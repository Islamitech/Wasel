import React, { useState } from 'react';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { Toast } from '../ui/Chip.js';
import { AdminUser } from '../../types/admin.js';
import { formatAuthError } from '@wasel/shared';

interface AdminAuthScreenProps {
  onSuccess: (user: AdminUser) => void;
}

export const AdminAuthScreen: React.FC<AdminAuthScreenProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.auth.adminLogin(email.trim(), password, 'Admin Web Console');
      localStorage.setItem('wasel_admin_access_token', res.accessToken);
      localStorage.setItem('wasel_admin_refresh_token', res.refreshToken);
      localStorage.setItem('wasel_admin_user', JSON.stringify(res.user));
      setToast({ message: 'تم تسجيل الدخول بنجاح كمسؤول نظام', type: 'ok' });
      onSuccess(res.user as AdminUser);
    } catch (err) {
      const errorMsg = formatAuthError(err);
      setError(errorMsg);
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
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
          🛡️
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          لوحة تحكم منصة واصل
        </h1>
        <p style={{ color: 'var(--mut, #5d716c)', marginTop: '6px', fontSize: '0.95rem' }}>
          بوابة الإدارة المركزية والعمليات
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <Field
          label="البريد الإلكتروني للمسؤول"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error || undefined}
          required
        />

        <Field
          label="كلمة المرور"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Button type="submit" isLoading={loading}>
          تسجيل الدخول إلى الخادم
        </Button>
      </form>
    </div>
  );
};

