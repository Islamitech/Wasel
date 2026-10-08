import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';

interface OrdersDashboardData {
  total?: number;
  byStatus?: Record<string, number>;
}

interface DriversDashboardData {
  total?: number;
  online?: number;
  approved?: number;
  pending?: number;
}

interface SubscriptionsDashboardData {
  active?: number;
  trial?: number;
  expiringWithin7Days?: number;
}

interface DisputesDashboardData {
  opened?: number;
  underReview?: number;
  resolved?: number;
}

export const OverviewTab: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('ar-EG'));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('ar-EG'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiClient.admin.getOverview(),
    refetchInterval: 15000,
  });

  const ordersDashQuery = useQuery<OrdersDashboardData>({
    queryKey: ['admin', 'dashboard', 'orders'],
    queryFn: () => apiClient.request<OrdersDashboardData>('/admin/dashboard/orders'),
    refetchInterval: 15000,
  });

  const driversDashQuery = useQuery<DriversDashboardData>({
    queryKey: ['admin', 'dashboard', 'drivers'],
    queryFn: () => apiClient.request<DriversDashboardData>('/admin/dashboard/drivers'),
    refetchInterval: 15000,
  });

  const subsDashQuery = useQuery<SubscriptionsDashboardData>({
    queryKey: ['admin', 'dashboard', 'subscriptions'],
    queryFn: () => apiClient.request<SubscriptionsDashboardData>('/admin/dashboard/subscriptions'),
    refetchInterval: 15000,
  });

  const disputesDashQuery = useQuery<DisputesDashboardData>({
    queryKey: ['admin', 'dashboard', 'disputes'],
    queryFn: () => apiClient.request<DisputesDashboardData>('/admin/dashboard/disputes'),
    refetchInterval: 15000,
  });

  const isLoading = overviewQuery.isLoading;

  const totalOrders = ordersDashQuery.data?.total || 0;
  const statusMap = ordersDashQuery.data?.byStatus || {};
  const inProgressOrders = (statusMap['agreed'] || 0) + (statusMap['in_progress'] || 0);
  const completedOrders = statusMap['completed'] || 0;
  const publishedOrders = statusMap['published'] || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
              لوحة العمليات والتحكم المركزية 📊
            </h2>
            <Chip
              label={overviewQuery.data?.status === 'operational' ? 'المنظومة تعمل بكفاءة' : 'جاري الفحص'}
              variant={overviewQuery.data?.status === 'operational' ? 'ok' : 'warn'}
            />
          </div>
          <p style={{ color: 'var(--mut, #5d716c)', fontSize: '0.9rem', marginTop: '4px' }}>
            المراقبة الحية للطلبات والأسطول في قطاع حدائق الأهرام — الوقت الحالي: <strong>{currentTime}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button
            variant="outline"
            onClick={() => {
              overviewQuery.refetch();
              ordersDashQuery.refetch();
              driversDashQuery.refetch();
              subsDashQuery.refetch();
              disputesDashQuery.refetch();
            }}
          >
            تحديث البيانات 🔄
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '60px', display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* Hero Operational Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #12302b 0%, #1a433d 100%)',
              color: '#fff',
              padding: '26px 30px',
              borderRadius: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '20px',
              boxShadow: '0 8px 24px rgba(18, 48, 43, 0.2)',
            }}
          >
            <div style={{ maxWidth: '600px' }}>
              <span
                style={{
                  background: 'rgba(242, 162, 12, 0.2)',
                  color: '#f2a20c',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-block',
                  marginBottom: '10px',
                }}
              >
                المنطقة التشغيلية: حدائق الأهرام (EG-GZ-HDA)
              </span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: '0 0 8px 0' }}>
                مرحباً بك في غرفة القيادة والتحكم لمنصة واصل
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6, margin: 0 }}>
                تتيح لك اللوحة تتبع الأسطول لحظياً على الخريطة، قبول وتوثيق الكباتن، إدارة الاشتراكات والتحصيل النقدي، محاكاة الطلبات الحية، وفض النزاعات.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '16px 20px',
                  borderRadius: '14px',
                  textAlign: 'center',
                  minWidth: '130px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>الكباتن المتصلين</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80', marginTop: '4px' }}>
                  {driversDashQuery.data?.online ?? 0}
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '16px 20px',
                  borderRadius: '14px',
                  textAlign: 'center',
                  minWidth: '130px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>الطلبات قيد التنفيذ</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                  {inProgressOrders}
                </div>
              </div>
            </div>
          </div>

          {/* Primary Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Orders KPI */}
            <div
              style={{
                background: '#fff',
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>📦 حركة الطلبات</span>
                <Chip label="اليوم" variant="default" />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-ink)', marginTop: '8px' }}>
                {totalOrders}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.8rem' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {completedOrders} مكتمل</span>
                <span style={{ color: '#0284c7', fontWeight: 700 }}>• {publishedOrders} في الرادار</span>
              </div>
            </div>

            {/* Drivers KPI */}
            <div
              style={{
                background: '#fff',
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>🛵 جاهزية الأسطول</span>
                <Chip label="مباشر" variant="ok" />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#16a34a', marginTop: '8px' }}>
                {driversDashQuery.data?.online ?? 0}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--mut)' }}>إجمالي الأسطول: {driversDashQuery.data?.total ?? 0}</span>
                <span style={{ color: '#ea580c', fontWeight: 600 }}>• {driversDashQuery.data?.pending ?? 0} في انتظار التوثيق</span>
              </div>
            </div>

            {/* Subscriptions KPI */}
            <div
              style={{
                background: '#fff',
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>🎫 الاشتراكات السارية</span>
                <Chip label="شهري" variant="ok" />
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0284c7', marginTop: '8px' }}>
                {subsDashQuery.data?.active ?? 0}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.8rem' }}>
                <span style={{ color: '#d97706', fontWeight: 700 }}>🎁 {subsDashQuery.data?.trial ?? 0} تجريبي</span>
                <span style={{ color: '#dc2626' }}>• {subsDashQuery.data?.expiringWithin7Days ?? 0} تنتهي قريباً</span>
              </div>
            </div>

            {/* Disputes KPI */}
            <div
              style={{
                background: '#fff',
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>⚖️ فض النزاعات والشكاوى</span>
                <Chip
                  label={(disputesDashQuery.data?.opened ?? 0) > 0 ? 'مفتوح' : 'مستقر'}
                  variant={(disputesDashQuery.data?.opened ?? 0) > 0 ? 'no' : 'ok'}
                />
              </div>
              <div
                style={{
                  fontSize: '2.2rem',
                  fontWeight: 800,
                  color: (disputesDashQuery.data?.opened ?? 0) > 0 ? '#dc2626' : '#16a34a',
                  marginTop: '8px',
                }}
              >
                {disputesDashQuery.data?.opened ?? 0}
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--mut)' }}>
                قيد المراجعة والتحكيم: {disputesDashQuery.data?.underReview ?? 0}
              </div>
            </div>
          </div>

          {/* System & Operations Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Features Status Card */}
            <div
              style={{
                background: '#fff',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>
                مصفوفة الميزات والخدمات النشطة ⚡
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  'الهوية والتحقق بالـ OTP',
                  'رادار المطابقة الجغرافي',
                  'كتالوج المحطات المتعددة',
                  'قواعد التسعير الديناميكية',
                  'عروض أسعار الكباتن',
                  'نظام الاشتراكات والتحصيل',
                  'قناة SSE المباشرة',
                  'سجل التدقيق الأمني (Audit)',
                  'غرفة فض النزاعات',
                ].map((feat, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: '#f1f5f9',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#334155',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{ color: '#16a34a' }}>●</span> {feat}
                  </span>
                ))}
              </div>
            </div>

            {/* Geographical Operations Scope */}
            <div
              style={{
                background: '#fff',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '14px' }}>
                نطاق التغطية الجغرافية 📍
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>القطاع الأساسي:</span>
                  <strong>حدائق الأهرام (البوابات 1، 2، 3، 4)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>نصف قطر الرادار الافتراضي:</span>
                  <strong>3000 متر (توسع آلي حتى 7000 متر)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>محرك البحث المكاني:</span>
                  <strong style={{ color: '#16a34a' }}>PostgreSQL PostGIS (SRID 4326)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>أصناف مركبات الأسطول:</span>
                  <strong>دراجة، موتوسيكل، تروسيكل، نص نقل، جامبو</strong>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
