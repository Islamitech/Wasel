import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api.js';
import { Button } from '../ui/Button.js';
import { Chip, Toast } from '../ui/Chip.js';

interface AdminDashboardProps {
  user: any;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [protectedStatus, setProtectedStatus] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const check = await apiClient.auth.checkAdminAccess();
        setProtectedStatus(check.message);

        const ov = await apiClient.admin.getOverview();
        setOverview(ov);
      } catch (err: any) {
        setProtectedStatus('فشل التحقق من الصلاحيات: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleUpdateSetting = async () => {
    try {
      await apiClient.admin.updateSetting('otp_expiry_minutes', { value: 6 });
      setToast({ message: 'تم تحديث إعداد مهلة الرمز بنجاح وتسجيل عملية التدقيق', type: 'ok' });
    } catch (err: any) {
      setToast({ message: err.message || 'فشل التحديث', type: 'error' });
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>لوحة الإدارة المركزية | واصل</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>المسؤول: {user.fullName || user.email}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Chip label="Admin" variant="accent" />
          <Button variant="outline" style={{ minHeight: '38px', height: '38px', padding: '0 12px' }} onClick={onLogout}>
            تسجيل خروج
          </Button>
        </div>
      </header>

      {/* RBAC Protected Status Card */}
      <div
        style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
          🛡️ فحص صلاحيات الـ RBAC والمسار المحمي (@Permissions)
        </h3>
        {loading ? (
          <p style={{ color: '#6b7280' }}>جاري التحقق من الصلاحيات...</p>
        ) : (
          <div style={{ color: 'var(--color-ok)', fontWeight: 600 }}>
            {protectedStatus}
          </div>
        )}
      </div>

      {/* Dynamic Data-Driven Settings Demo */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>
          ⚙️ إعدادات المنصة المعتمدة على قاعدة البيانات (Database-Driven Settings)
        </h3>
        <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.6 }}>
          لا توجد أسعار، فئات، أو حدود مشفرة في الكود البرمجي (Hard-coded). جميع الإعدادات يتم إدارتها ديناميكياً من جدول Settings مع تتبع سجل التدقيق (Audit Log).
        </p>
        <Button variant="secondary" onClick={handleUpdateSetting}>
          تحديث إعداد (مهلة صلاحية الـ OTP) عبر الـ API
        </Button>
      </div>

      {overview && (
        <div style={{ padding: '16px', backgroundColor: 'var(--color-chip)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>النظام التشغيلي:</div>
          <pre style={{ direction: 'ltr', fontSize: '0.85rem' }}>{JSON.stringify(overview, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
