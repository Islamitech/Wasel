import React, { useState } from 'react';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import { Toast } from '../ui/Chip.js';
import { AdminUser } from '../../types/admin.js';

interface AdminAuthScreenProps {
  onSuccess: (user: AdminUser) => void;
}

export const AdminAuthScreen: React.FC<AdminAuthScreenProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('admin@wasel.local');
  const [password, setPassword] = useState('Admin@123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.auth.adminLogin(email, password, 'Admin Web Console');
      localStorage.setItem('wasel_admin_access_token', res.accessToken);
      localStorage.setItem('wasel_admin_refresh_token', res.refreshToken);
      localStorage.setItem('wasel_admin_user', JSON.stringify(res.user));
      setToast({ message: 'تم تسجيل الدخول بنجاح كمسؤول نظام', type: 'ok' });
      onSuccess(res.user as AdminUser);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'بيانات الدخول غير صحيحة';
      setError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEnterDemo = () => {
    const demoUser: AdminUser = {
      id: 'admin-demo-id',
      email: 'admin@wasel.local',
      fullName: 'مدير منصة واصل (تجريبي)',
      roles: ['admin'],
    };
    localStorage.setItem('wasel_admin_user', JSON.stringify(demoUser));
    onSuccess(demoUser);
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

        <div
          style={{
            fontSize: '0.825rem',
            backgroundColor: 'var(--chip, #eef3ef)',
            color: 'var(--ink, #12302b)',
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid var(--line, #e2e8e4)',
            lineHeight: 1.5,
          }}
        >
          🔑 <strong>بيانات الدخول المعتمدة:</strong>
          <br />
          البريد: <code>admin@wasel.local</code>
          <br />
          كلمة المرور: <code>Admin@123456</code>
        </div>

        <Button type="submit" isLoading={loading}>
          تسجيل الدخول إلى الخادم
        </Button>

        <div style={{ textAlign: 'center', margin: '4px 0', color: 'var(--mut, #5d716c)', fontSize: '0.85rem' }}>
          — أو —
        </div>

        <button
          type="button"
          onClick={handleEnterDemo}
          className="btn"
          style={{
            width: '100%',
            justifyContent: 'center',
            backgroundColor: 'var(--color-ink, #12302b)',
            color: 'var(--color-accent, #f2a20c)',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 700,
          }}
        >
          ✨ استعراض النموذج التفاعلي (وضع التجربة)
        </button>
      </form>
    </div>
  );
};
