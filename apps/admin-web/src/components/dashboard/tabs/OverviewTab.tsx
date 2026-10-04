import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';

interface OrdersDashboardData {
  activeOrders?: number;
  total?: number;
  completedToday?: number;
}

interface DriversDashboardData {
  onlineDrivers?: number;
  online?: number;
  totalDrivers?: number;
}

interface SubscriptionsDashboardData {
  activeSubscriptions?: number;
  active?: number;
  activeDrivers?: number;
  trialCount?: number;
}

interface DisputesDashboardData {
  openDisputes?: number;
  open?: number;
  pending?: number;
  resolvedToday?: number;
}

export const OverviewTab: React.FC = () => {
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiClient.admin.getOverview(),
    refetchInterval: 30000,
  });

  const ordersDashQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'orders'],
    queryFn: () => apiClient.request<OrdersDashboardData>('/admin/dashboard/orders'),
    refetchInterval: 30000,
  });

  const driversDashQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'drivers'],
    queryFn: () => apiClient.request<DriversDashboardData>('/admin/dashboard/drivers'),
    refetchInterval: 30000,
  });

  const subsDashQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'subscriptions'],
    queryFn: () => apiClient.request<SubscriptionsDashboardData>('/admin/dashboard/subscriptions'),
    refetchInterval: 30000,
  });

  const disputesDashQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'disputes'],
    queryFn: () => apiClient.request<DisputesDashboardData>('/admin/dashboard/disputes'),
    refetchInterval: 30000,
  });

  const isLoading = overviewQuery.isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            لوحة العمليات المركزية
          </h2>
          <p style={{ color: 'var(--mut, #5d716c)', fontSize: '0.9rem', marginTop: '4px' }}>
            مراقبة الأداء الحي وتوزيع الأسطول في حدائق الأهرام
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Chip
            label={overviewQuery.data?.status === 'operational' ? 'الخادم يعمل بكفاءة' : 'جاري الفحص'}
            variant={overviewQuery.data?.status === 'operational' ? 'ok' : 'warn'}
          />
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
        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '20px',
                borderRadius: 'var(--radius-md, 16px)',
                border: '1px solid var(--line, #e2e8f0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--mut, #5d716c)', fontWeight: 600 }}>
                📦 إجمالي الطلبات النشطة
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-ink)', marginTop: '8px' }}>
                {ordersDashQuery.data?.activeOrders ?? ordersDashQuery.data?.total ?? 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '4px' }}>
                مكتمل اليوم: {ordersDashQuery.data?.completedToday ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '20px',
                borderRadius: 'var(--radius-md, 16px)',
                border: '1px solid var(--line, #e2e8f0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--mut, #5d716c)', fontWeight: 600 }}>
                🛵 الكباتن المتصلون الآن
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0284c7', marginTop: '8px' }}>
                {driversDashQuery.data?.onlineDrivers ?? driversDashQuery.data?.online ?? 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--mut, #5d716c)', marginTop: '4px' }}>
                إجمالي الأسطول: {driversDashQuery.data?.totalDrivers ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '20px',
                borderRadius: 'var(--radius-md, 16px)',
                border: '1px solid var(--line, #e2e8f0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--mut, #5d716c)', fontWeight: 600 }}>
                🎫 الاشتراكات السارية
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginTop: '8px' }}>
                {subsDashQuery.data?.activeSubscriptions ?? subsDashQuery.data?.active ?? 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ea580c', marginTop: '4px' }}>
                فترة تجريبية: {subsDashQuery.data?.trialCount ?? 0}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '20px',
                borderRadius: 'var(--radius-md, 16px)',
                border: '1px solid var(--line, #e2e8f0)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--mut, #5d716c)', fontWeight: 600 }}>
                ⚖️ النزاعات المفتوحة
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: (disputesDashQuery.data?.openDisputes ?? 0) > 0 ? '#dc2626' : '#16a34a', marginTop: '8px' }}>
                {disputesDashQuery.data?.openDisputes ?? disputesDashQuery.data?.open ?? 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--mut, #5d716c)', marginTop: '4px' }}>
                تتطلب تحكيم الإدارة
              </div>
            </div>
          </div>

          {/* Region and System Status Card */}
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: 'var(--radius-md, 16px)',
              border: '1px solid var(--line, #e2e8f0)',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
              معلومات النشر والنظام
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)' }}>المنطقة النشطة:</span>
                <p style={{ fontWeight: 700, marginTop: '2px' }}>{overviewQuery.data?.region || 'حدائق الأهرام (EG-GZ-HDA)'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)' }}>حالة الاتصال بالـ API:</span>
                <p style={{ fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>متصل وموثق</p>
              </div>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--mut)' }}>الوقت الفعلي:</span>
                <p style={{ fontWeight: 600, marginTop: '2px' }}>{overviewQuery.data?.timestamp ? new Date(overviewQuery.data.timestamp).toLocaleTimeString('ar-EG') : '—'}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
