import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatAuthError } from '@wasel/shared';

interface OtpItem {
  id: string;
  phone: string;
  phoneMasked?: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
  isExpired: boolean;
  isVerified: boolean;
}

export const SimulatorTab: React.FC = () => {
  const queryClient = useQueryClient();

  // Test Order State
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [customOrderNotes, setCustomOrderNotes] = useState('');
  const [orderSuccessBanner, setOrderSuccessBanner] = useState<string | null>(null);

  // OTP State
  const [otpPhone, setOtpPhone] = useState('+201099999001');
  const [otpRole, setOtpRole] = useState<'customer' | 'driver'>('driver');
  const [otpCustomCode, setOtpCustomCode] = useState('123456');
  const [otpSuccessBanner, setOtpSuccessBanner] = useState<string | null>(null);

  // User Registration State
  const [regPhone, setRegPhone] = useState('+201011112222');
  const [regName, setRegName] = useState('كابتن واصل المعتمد');
  const [regRole, setRegRole] = useState<'customer' | 'driver'>('driver');
  const [regSuccessBanner, setRegSuccessBanner] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sampleRoutes = [
    {
      title: '🛒 مشوار شراء طلبات وصيدلية (بوابة 1)',
      desc: 'شراء أدوية ومستلزمات من صيدلية العزبي بوابة 1 والتوصيل إلى عمارة 142 منطقة ز',
      duration: '15 دقيقة',
      estimatedFare: '35 ج',
    },
    {
      title: '📦 نقل وشحن طرد وبضاعة (بوابة 2 إلى 4)',
      desc: 'استلام طرد أدوات كهربائية من محطة بوابة خفرع والتوصيل إلى بوابة مينا',
      duration: '25 دقيقة',
      estimatedFare: '65 ج',
    },
    {
      title: '🚚 نقل عفش وأثاث خفيف (نص نقل)',
      desc: 'نقل غسالة وثلاجة من شارع الجيش إلى منطقة ن بجوار النادي',
      duration: '40 دقيقة',
      estimatedFare: '180 ج',
    },
  ];

  // 1. Fetch Recent OTPs
  const recentOtpsQuery = useQuery({
    queryKey: ['admin', 'otp', 'recent'],
    queryFn: () => apiClient.admin.getRecentOtps(),
    refetchInterval: 5000,
  });

  // 2. Create Test Order Mutation
  const createOrderMutation = useMutation({
    mutationFn: () => {
      const route = sampleRoutes[selectedRouteIndex];
      const desc = customOrderNotes.trim()
        ? `${route?.title}: ${customOrderNotes}`
        : route?.desc || 'طلب تجريبي في حدائق الأهرام';
      return apiClient.admin.createTestOrder({ description: desc });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fleet'] });
      setOrderSuccessBanner(`🎉 ${data.message} رقم الطلب: #${data.orderId.slice(0, 8)}`);
      setErrorMessage(null);
      setTimeout(() => setOrderSuccessBanner(null), 6000);
    },
    onError: (err) => setErrorMessage(formatAuthError(err)),
  });

  // 3. Send/Generate OTP Mutation
  const sendOtpMutation = useMutation({
    mutationFn: () =>
      apiClient.admin.sendOtp({
        phone: otpPhone,
        role: otpRole,
        customCode: otpCustomCode,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'otp', 'recent'] });
      setOtpSuccessBanner(`✅ تم توليد وتفعيل الرمز [ ${data.code} ] للرقم ${data.phone}`);
      setErrorMessage(null);
      setTimeout(() => setOtpSuccessBanner(null), 7000);
    },
    onError: (err) => setErrorMessage(formatAuthError(err)),
  });

  // 4. Register Official User Mutation
  const registerUserMutation = useMutation({
    mutationFn: () =>
      apiClient.admin.registerUser({
        phone: regPhone,
        fullName: regName,
        role: regRole,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fleet'] });
      setRegSuccessBanner(`🎉 ${data.message}`);
      setErrorMessage(null);
      setTimeout(() => setRegSuccessBanner(null), 6000);
    },
    onError: (err) => setErrorMessage(formatAuthError(err)),
  });

  const recentOtps: OtpItem[] = recentOtpsQuery.data?.items || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          مركز المحاكاة والعمليات السريعة ⚡
        </h2>
        <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
          أدوات الاختبار المباشر، توليد الطلبات في الرادار، واستخراج رموز التحقق OTP فوراً
        </p>
      </div>

      {errorMessage && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '14px', borderRadius: '12px' }}>
          {errorMessage}
        </div>
      )}

      {/* Grid of Simulator Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Card 1: Instant Order Dispatcher */}
        <div
          style={{
            background: '#fff',
            borderRadius: '18px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(242, 162, 12, 0.15)',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
              }}
            >
              📦
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>مولد الطلبات الفوري في الرادار</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>نشر طلب حقيقي لتلقي عروض الكباتن</span>
            </div>
          </div>

          {orderSuccessBanner && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
              {orderSuccessBanner}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
              اختر سيناريو الرحلة:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sampleRoutes.map((route, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedRouteIndex(idx)}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: selectedRouteIndex === idx ? '2px solid #f2a20c' : '1px solid #e2e8f0',
                    background: selectedRouteIndex === idx ? '#fffbeb' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{route.title}</strong>
                    <Chip label={route.estimatedFare} variant="ok" />
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--mut)', marginTop: '4px' }}>
                    {route.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              ملاحظات إضافية على الطلب (اختياري):
            </label>
            <input
              type="text"
              placeholder="مثال: يرجى إحضار كيس بلاستيكي إضافي"
              value={customOrderNotes}
              onChange={(e) => setCustomOrderNotes(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <Button
            variant="primary"
            disabled={createOrderMutation.isPending}
            onClick={() => createOrderMutation.mutate()}
            style={{ padding: '10px', fontWeight: 800, fontSize: '0.95rem' }}
          >
            {createOrderMutation.isPending ? 'جاري البث في الرادار...' : '🚀 نشر الطلب في الرادار فوراً'}
          </Button>
        </div>

        {/* Card 2: Instant OTP Injector */}
        <div
          style={{
            background: '#fff',
            borderRadius: '18px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
              }}
            >
              🔑
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>مولد رموز التحقق الفورية (OTP)</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>تسجيل الدخول الفوري دون انتظار رسائل SMS</span>
            </div>
          </div>

          {otpSuccessBanner && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
              {otpSuccessBanner}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              رقم الهاتف المستهدف:
            </label>
            <input
              type="text"
              value={otpPhone}
              onChange={(e) => setOtpPhone(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', direction: 'ltr', textAlign: 'right' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                نوع الحساب:
              </label>
              <select
                value={otpRole}
                onChange={(e) => setOtpRole(e.target.value as any)}
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="driver">كابتن (Driver)</option>
                <option value="customer">عميل (Customer)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                رمز التحقق المخصص:
              </label>
              <input
                type="text"
                value={otpCustomCode}
                onChange={(e) => setOtpCustomCode(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', direction: 'ltr', textAlign: 'center', fontWeight: 700 }}
              />
            </div>
          </div>

          <Button
            variant="outline"
            disabled={sendOtpMutation.isPending || !otpPhone.trim()}
            onClick={() => sendOtpMutation.mutate()}
            style={{ padding: '10px', fontWeight: 800, fontSize: '0.9rem' }}
          >
            {sendOtpMutation.isPending ? 'جاري التوليد...' : '⚡ توليد وتفعيل رمز التحقق'}
          </Button>

          {/* Quick Copy Tip */}
          <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: 'var(--mut)' }}>
            💡 يمكنك استخدام الرقم <strong>{otpPhone}</strong> والرمز <strong>{otpCustomCode}</strong> لتسجيل الدخول في تطبيقات العميل والكابتن فوراً.
          </div>
        </div>

        {/* Card 3: Instant Official Registration */}
        <div
          style={{
            background: '#fff',
            borderRadius: '18px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(22, 163, 74, 0.15)',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
              }}
            >
              🛡️
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>التسجيل الإداري الرسمي</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>إنشاء حساب وتفعيله مباشرة في قاعدة البيانات</span>
            </div>
          </div>

          {regSuccessBanner && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem' }}>
              {regSuccessBanner}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              الاسم الكامل:
            </label>
            <input
              type="text"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                رقم الهاتف المصري:
              </label>
              <input
                type="text"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', direction: 'ltr', textAlign: 'right' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                الدور:
              </label>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value as any)}
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="driver">كابتن معتمد</option>
                <option value="customer">عميل واصل</option>
              </select>
            </div>
          </div>

          <Button
            variant="primary"
            disabled={registerUserMutation.isPending || !regPhone.trim()}
            onClick={() => registerUserMutation.mutate()}
            style={{ padding: '10px', fontWeight: 800, fontSize: '0.9rem' }}
          >
            {registerUserMutation.isPending ? 'جاري الإنشاء والتفعيل...' : '✅ إنشاء وتفعيل الحساب فوراً'}
          </Button>
        </div>
      </div>

      {/* Live Recent OTP Challenges Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>سجل أكواد التحقق الحية (OTP Feed)</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>
              متابعة الأكواد الصادرة في المنظومة لتسهيل المساعدة الفنية
            </span>
          </div>

          <Button variant="outline" onClick={() => recentOtpsQuery.refetch()} style={{ fontSize: '0.8rem' }}>
            تحديث القائمة 🔄
          </Button>
        </div>

        {recentOtpsQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : recentOtps.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--mut)' }}>
            لا توجد أكواد تحقق صادرة مؤخراً
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 14px' }}>الهاتف</th>
                  <th style={{ padding: '10px 14px' }}>الحالة</th>
                  <th style={{ padding: '10px 14px' }}>المحاولات</th>
                  <th style={{ padding: '10px 14px' }}>تاريخ الإصدار</th>
                  <th style={{ padding: '10px 14px' }}>الصلاحية</th>
                </tr>
              </thead>
              <tbody>
                {recentOtps.slice(0, 10).map((otp) => (
                  <tr key={otp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', direction: 'ltr', textAlign: 'right', fontWeight: 700 }}>
                      {otp.phone}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Chip
                        label={otp.isVerified ? 'تم التحقق بنجاح' : otp.isExpired ? 'منتهي الصلاحية' : 'نشط وجاهز'}
                        variant={otp.isVerified ? 'ok' : otp.isExpired ? 'default' : 'warn'}
                      />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {otp.attempts} / {otp.maxAttempts}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--mut)' }}>
                      {new Date(otp.createdAt).toLocaleTimeString('ar-EG')}
                    </td>
                    <td style={{ padding: '10px 14px', color: otp.isExpired ? '#94a3b8' : '#16a34a', fontWeight: 600 }}>
                      {otp.isExpired ? 'انتهت' : 'سارية'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
