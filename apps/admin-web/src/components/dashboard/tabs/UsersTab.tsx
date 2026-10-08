import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { formatAuthError } from '@wasel/shared';

interface AdminUserItem {
  id: string;
  phone?: string | null;
  phoneMasked?: string | null;
  fullName?: string | null;
  roles?: string[];
  role?: string | null;
  status?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

interface OtpItem {
  id: string;
  phone: string;
  phoneMasked?: string;
  attempts: number;
  maxAttempts: number;
  resendAvailableAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
  isExpired: boolean;
  isVerified: boolean;
}

export const UsersTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'otp' | 'register'>('users');

  // Search & Users List State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // OTP Sender State
  const [otpPhone, setOtpPhone] = useState('');
  const [otpRole, setOtpRole] = useState<'customer' | 'driver'>('customer');
  const [otpCustomCode, setOtpCustomCode] = useState('123456');
  const [otpSuccessBanner, setOtpSuccessBanner] = useState<string | null>(null);

  // Direct Registration State
  const [regPhone, setRegPhone] = useState('');
  const [regName, setRegName] = useState('');
  const [regRole, setRegRole] = useState<'customer' | 'driver'>('driver');
  const [regSuccessBanner, setRegSuccessBanner] = useState<string | null>(null);

  // 1. Fetch Users Query
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', debouncedSearch],
    queryFn: () => apiClient.admin.searchUsers(debouncedSearch),
  });

  // 2. Fetch Recent OTPs Query
  const recentOtpsQuery = useQuery({
    queryKey: ['admin', 'otp', 'recent'],
    queryFn: () => apiClient.admin.getRecentOtps(),
    refetchInterval: 6000,
  });

  // 3. Toggle User Active Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiClient.admin.updateUserStatus(userId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  // 4. Send OTP Mutation
  const sendOtpMutation = useMutation({
    mutationFn: (dto: { phone: string; role: string; customCode?: string }) =>
      apiClient.admin.sendOtp(dto),
    onSuccess: (data) => {
      setOtpSuccessBanner(`✅ تم توليد وتفعيل رمز التحقق [ ${data.code} ] للرقم [ ${data.phone} ] بنجاح!`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'otp', 'recent'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  // 5. Register User Mutation
  const registerUserMutation = useMutation({
    mutationFn: (dto: { phone: string; fullName: string; role: 'customer' | 'driver' }) =>
      apiClient.admin.registerUser(dto),
    onSuccess: (data) => {
      setRegSuccessBanner(`🎉 ${data.message} - رقم الحساب: ${data.user.phone}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setRegPhone('');
      setRegName('');
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(searchTerm.trim());
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPhone.trim()) return;
    sendOtpMutation.mutate({
      phone: otpPhone.trim(),
      role: otpRole,
      customCode: otpCustomCode.trim() || undefined,
    });
  };

  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPhone.trim()) return;
    registerUserMutation.mutate({
      phone: regPhone.trim(),
      fullName: regName.trim(),
      role: regRole,
    });
  };

  const usersList: AdminUserItem[] = Array.isArray(usersQuery.data)
    ? usersQuery.data
    : usersQuery.data?.items || [];

  const otpsList: OtpItem[] = recentOtpsQuery.data?.items || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
      {/* Top Header */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          إدارة الحسابات ومركز رموز التحقق (OTP Hub)
        </h2>
        <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
          تفعيل وتنشيط الحسابات، توليد وإرسال رموز التحقق OTP، وتسجيل العملاء والكباتن رسمياً في قاعدة البيانات.
        </p>
      </div>

      {/* Sub Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('users')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: activeSubTab === 'users' ? 'var(--color-brand, #12302b)' : '#f1f5f9',
            color: activeSubTab === 'users' ? '#ffffff' : '#334155',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
          }}
        >
          👥 حسابات المستخدمين ({usersList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('otp')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: activeSubTab === 'otp' ? 'var(--color-brand, #12302b)' : '#f1f5f9',
            color: activeSubTab === 'otp' ? '#ffffff' : '#334155',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
          }}
        >
          🚀 إرسال وتوليد OTP فوري
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('register')}
          style={{
            padding: '10px 18px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: activeSubTab === 'register' ? 'var(--color-brand, #12302b)' : '#f1f5f9',
            color: activeSubTab === 'register' ? '#ffffff' : '#334155',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
          }}
        >
          📝 تسجيل وتفعيل حساب رسمي
        </button>
      </div>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px 16px', borderRadius: '10px', fontWeight: 600 }}>
          {actionError}
        </div>
      )}

      {/* SUB-TAB 1: USERS LIST & MANAGEMENT */}
      {activeSubTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search Bar */}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الهاتف أو الاسم أو المعرّف (أو اضغط مسافة لعرض الكل)..."
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1.5px solid var(--line, #cbd5e1)',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
              }}
            />
            <Button variant="primary" type="submit" style={{ padding: '0 24px' }}>
              🔍 بحث
            </Button>
            {debouncedSearch && (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedSearch('');
                }}
              >
                إعادة ضبط
              </Button>
            )}
          </form>

          {/* Results Table */}
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-md, 16px)',
              border: '1px solid var(--line, #e2e8f0)',
              overflowX: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {usersQuery.isLoading ? (
              <div style={{ padding: '50px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : usersList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
                لا توجد حسابات مسجلة مطابقة للبحث
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                    <th style={{ padding: '14px 16px' }}>رقم الهاتف</th>
                    <th style={{ padding: '14px 16px' }}>الاسم الكامل</th>
                    <th style={{ padding: '14px 16px' }}>الأدوار (Roles)</th>
                    <th style={{ padding: '14px 16px' }}>الحالة</th>
                    <th style={{ padding: '14px 16px' }}>تاريخ التسجيل</th>
                    <th style={{ padding: '14px 16px' }}>إدارة الحساب و OTP</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((user: AdminUserItem) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', direction: 'ltr', textAlign: 'right', fontWeight: 800 }}>
                        {user.phone ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span>{user.phone}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(user.phone || '')}
                              title="نسخ الرقم"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              📋
                            </button>
                          </div>
                        ) : user.phoneMasked || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>{user.fullName || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        {Array.isArray(user.roles) && user.roles.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {user.roles.map((r: string) => (
                              <span
                                key={r}
                                style={{
                                  backgroundColor: r === 'driver' ? '#dbeafe' : r === 'admin' ? '#fef3c7' : '#e2e8f0',
                                  color: r === 'driver' ? '#1d4ed8' : r === 'admin' ? '#b45309' : '#334155',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                }}
                              >
                                {r === 'driver' ? '🚗 كابتن' : r === 'customer' ? '👤 عميل' : r}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            backgroundColor: user.isActive !== false ? '#dcfce7' : '#fee2e2',
                            color: user.isActive !== false ? '#15803d' : '#b91c1c',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                          }}
                        >
                          {user.isActive !== false ? 'مفعل ونشط 🟢' : 'محظور معطل 🔴'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button
                            variant={user.isActive !== false ? 'outline' : 'primary'}
                            style={{
                              padding: '5px 12px',
                              fontSize: '0.8rem',
                              borderColor: user.isActive !== false ? '#f87171' : undefined,
                              color: user.isActive !== false ? '#dc2626' : undefined,
                            }}
                            isLoading={toggleStatusMutation.isPending}
                            onClick={() => {
                              const targetState = user.isActive === false;
                              const actionName = targetState ? 'تنشيط وتفعيل' : 'حظر وتعطيل';
                              if (window.confirm(`هل أنت متأكد من ${actionName} حساب (${user.fullName || user.phone})؟`)) {
                                toggleStatusMutation.mutate({ userId: user.id, isActive: targetState });
                              }
                            }}
                          >
                            {user.isActive !== false ? '🚫 حظر' : '✅ تنشيط'}
                          </Button>

                          {user.phone && (
                            <button
                              type="button"
                              onClick={() => {
                                setOtpPhone(user.phone || '');
                                setActiveSubTab('otp');
                              }}
                              style={{
                                padding: '5px 10px',
                                fontSize: '0.8rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#f8fafc',
                                color: '#1e293b',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                              title="إرسال رمز OTP لهذا الرقم"
                            >
                              📲 إرسال OTP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: OTP HUB */}
      {activeSubTab === 'otp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Send OTP Card */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              border: '1.5px solid var(--line, #e2e8f0)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '6px' }}>
              🚀 توليد وإرسال رمز تحقق OTP فوري
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
              يُمكنك إرسال رمز التحقق لأي رقم هاتف في مصر (عميل أو كابتن) ويتم تسجيل التحدي وتفعيله فوراً في قاعدة البيانات.
            </p>

            {otpSuccessBanner && (
              <div
                style={{
                  backgroundColor: '#dcfce7',
                  border: '1.5px solid #86efac',
                  color: '#15803d',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  marginBottom: '16px',
                }}
              >
                {otpSuccessBanner}
              </div>
            )}

            <form onSubmit={handleSendOtp} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  رقم الهاتف (مصر):
                </label>
                <input
                  type="text"
                  placeholder="مثال: 01143888355 أو +201143888355"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.95rem',
                    direction: 'ltr',
                    textAlign: 'right',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  نوع الحساب:
                </label>
                <select
                  value={otpRole}
                  onChange={(e) => setOtpRole(e.target.value as 'customer' | 'driver')}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.95rem',
                  }}
                >
                  <option value="customer">👤 عميل (Customer)</option>
                  <option value="driver">🚗 كابتن (Driver)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  رمز التحقق (Custom Code):
                </label>
                <input
                  type="text"
                  value={otpCustomCode}
                  onChange={(e) => setOtpCustomCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    fontWeight: 800,
                  }}
                />
              </div>

              <div>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={sendOtpMutation.isPending}
                  style={{ width: '100%', minHeight: '44px', fontWeight: 800 }}
                >
                  ⚡ توليد وإرسال الرمز
                </Button>
              </div>
            </form>
          </div>

          {/* Recent OTP Requests Table */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1.5px solid var(--line, #e2e8f0)',
              overflowX: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontWeight: 800, margin: 0, fontSize: '1.05rem' }}>
                📋 سجل أحدث طلبات وتحديات رموز التحقق (Live OTP Logs)
              </h4>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'otp', 'recent'] })}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-brand, #12302b)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                🔄 تحديث السجل
              </button>
            </div>

            {recentOtpsQuery.isLoading ? (
              <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : otpsList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                لا توجد طلبات OTP مسجلة حالياً
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px' }}>رقم الهاتف</th>
                    <th style={{ padding: '12px 16px' }}>حالة الرمز</th>
                    <th style={{ padding: '12px 16px' }}>المحاولات</th>
                    <th style={{ padding: '12px 16px' }}>وقت الإنشاء</th>
                    <th style={{ padding: '12px 16px' }}>صلاحية الرمز</th>
                  </tr>
                </thead>
                <tbody>
                  {otpsList.map((otp) => (
                    <tr key={otp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', direction: 'ltr', textAlign: 'right', fontWeight: 700 }}>
                        {otp.phone}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {otp.isVerified ? (
                          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem' }}>
                            تم التحقق والدخول ✅
                          </span>
                        ) : otp.isExpired ? (
                          <span style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem' }}>
                            منتهي الصلاحية ⌛
                          </span>
                        ) : (
                          <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem' }}>
                            صالح للاستخدام ⏳
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {otp.attempts} / {otp.maxAttempts}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>
                        {otp.createdAt ? new Date(otp.createdAt).toLocaleTimeString('ar-EG') : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>
                        {otp.expiresAt ? new Date(otp.expiresAt).toLocaleTimeString('ar-EG') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: OFFICIAL DIRECT REGISTRATION */}
      {activeSubTab === 'register' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '28px',
            border: '1.5px solid var(--line, #e2e8f0)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            maxWidth: '650px',
          }}
        >
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '6px' }}>
            📝 تسجيل وتفعيل مستخدم أو كابتن جديد رسمياً
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '20px' }}>
            يقوم هذا النموذج بإنشاء الحساب رسمياً وتفعيله في جداول قاعدة البيانات (`users` و `user_roles` و `driver_profiles` أو `customer_profiles`) فوراً دون انتظار OTP.
          </p>

          {regSuccessBanner && (
            <div
              style={{
                backgroundColor: '#dcfce7',
                border: '1.5px solid #86efac',
                color: '#15803d',
                padding: '12px 16px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '0.95rem',
                marginBottom: '18px',
              }}
            >
              {regSuccessBanner}
            </div>
          )}

          <form onSubmit={handleRegisterUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>
                رقم الهاتف (مصر):
              </label>
              <input
                type="text"
                placeholder="مثال: 01012345678"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  direction: 'ltr',
                  textAlign: 'right',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>
                الاسم بالكامل:
              </label>
              <input
                type="text"
                placeholder="مثال: كابتن أحمد محمود"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>
                نوع الحساب والدور:
              </label>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value as 'customer' | 'driver')}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                }}
              >
                <option value="driver">🚗 كابتن معتمد (Driver) - تفعيل فوري للملف والأسطول</option>
                <option value="customer">👤 عميل (Customer) - تفعيل فوري للملف الشخصي</option>
              </select>
            </div>

            <div style={{ marginTop: '8px' }}>
              <Button
                variant="primary"
                type="submit"
                isLoading={registerUserMutation.isPending}
                style={{ width: '100%', minHeight: '48px', fontSize: '1rem', fontWeight: 800 }}
              >
                💾 تسجيل وتفعيل الحساب في قاعدة البيانات
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
