import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatEgp } from '@wasel/shared';

const STATUS_OPTIONS = [
  { value: '', label: 'جميع الحالات' },
  { value: 'published', label: '📢 منشور في الرادار' },
  { value: 'negotiating', label: '💬 جاري تقديم العروض' },
  { value: 'agreed', label: '🤝 تم الاتفاق' },
  { value: 'in_progress', label: '🛵 قيد التنفيذ' },
  { value: 'completed', label: '✅ مكتمل بنجاح' },
  { value: 'cancelled', label: '❌ ملغى' },
  { value: 'disputed', label: '⚖️ نزاع مفتوح' },
];

interface OrderStop {
  id?: string;
  seq?: number;
  actionCode?: string;
  actionNameAr?: string;
  description?: string;
  notes?: string;
  expectedDurationMinutes?: number;
  contactPhone?: string;
}

interface OrderItem {
  id: string;
  status: string;
  fareMinor?: number;
  fare?: number;
  stopsCount: number;
  customerName?: string;
  customerPhone?: string;
  driverName?: string;
  driverPhone?: string;
  waitMode?: string;
  createdAt: string;
}

export const OrdersTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const limit = 20;

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', selectedStatus, offset, searchQuery],
    queryFn: () =>
      apiClient.admin.listOrders({
        status: selectedStatus || undefined,
        limit,
        offset,
        search: searchQuery || undefined,
      }),
  });

  const selectedOrderDetailQuery = useQuery({
    queryKey: ['admin', 'order-detail', selectedOrderId],
    queryFn: () => (selectedOrderId ? apiClient.admin.getOrderDetails(selectedOrderId) : null),
    enabled: !!selectedOrderId,
  });

  // Cancel order mutation
  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiClient.admin.cancelOrder(orderId, reason),
    onSuccess: () => {
      setCancelModalOrderId(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'order-detail'] });
      setSuccessBanner('تم إلغاء الطلب وتحرير الكابتن وتوثيق الإجراء بنجاح.');
      setTimeout(() => setSuccessBanner(null), 5000);
    },
  });

  // Create test order mutation
  const createTestOrderMutation = useMutation({
    mutationFn: () =>
      apiClient.admin.createTestOrder({
        description: 'شراء أغراض سوبر ماركت وصيدلية — حدائق الأهرام البوابة الأولى',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fleet'] });
      setSuccessBanner(`🎉 ${data.message} رقم الطلب: #${data.orderId.slice(0, 8)}`);
      setTimeout(() => setSuccessBanner(null), 6000);
    },
  });

  const orders: OrderItem[] = Array.isArray(ordersQuery.data?.items)
    ? ordersQuery.data.items
    : [];

  const totalCount = ordersQuery.data?.total || orders.length;

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'published':
        return <Chip label="منشور في الرادار" variant="warn" />;
      case 'negotiating':
        return <Chip label="عروض أسعار" variant="warn" />;
      case 'agreed':
      case 'in_progress':
        return <Chip label="قيد التنفيذ 🛵" variant="ok" />;
      case 'completed':
        return <Chip label="مكتمل بنجاح" variant="ok" />;
      case 'cancelled':
        return <Chip label="ملغى" variant="no" />;
      case 'disputed':
        return <Chip label="نزاع مفتوح" variant="no" />;
      default:
        return <Chip label={status} variant="default" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Success Notification */}
      {successBanner && (
        <div
          style={{
            background: 'linear-gradient(90deg, #15803d, #16a34a)',
            color: '#fff',
            padding: '14px 18px',
            borderRadius: '12px',
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
          }}
        >
          <span>{successBanner}</span>
          <button
            onClick={() => setSuccessBanner(null)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Quick Action */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            إدارة الطلبات الحية والعمليات 📦
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
            متابعة دورة حياة الطلبات من النشر والتسعير حتى التنفيذ والتسليم
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => createTestOrderMutation.mutate()}
            disabled={createTestOrderMutation.isPending}
            style={{ padding: '8px 16px', fontSize: '0.9rem', fontWeight: 800 }}
          >
            {createTestOrderMutation.isPending ? 'جاري النشر...' : '⚡ إنشاء طلب تجريبي فوري'}
          </Button>

          <Button variant="outline" onClick={() => ordersQuery.refetch()}>
            تحديث 🔄
          </Button>
        </div>
      </div>

      {/* Filters and search */}
      <div
        style={{
          background: '#fff',
          padding: '16px 20px',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>الحالة:</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setOffset(0);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '0.85rem',
                minWidth: '180px',
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '240px' }}>
            <input
              type="text"
              placeholder="بحث بالرقم أو العميل أو الكابتن..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOffset(0);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 600 }}>
          إجمالي النتائج: <strong>{totalCount}</strong> طلب
        </div>
      </div>

      {/* Orders Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {ordersQuery.isLoading ? (
          <div style={{ padding: '60px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--mut)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📭</div>
            <p style={{ fontWeight: 700 }}>لا توجد طلبات مطابقة للمعايير المحددة</p>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              يمكنك الضغط على زر "إنشاء طلب تجريبي فوري" لاختبار المنظومة
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>رقم الطلب</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>العميل</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الكابتن المعين</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الحالة</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>المحطات</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الأجرة</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>التاريخ والوقت</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: OrderItem) => (
                <tr
                  key={order.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s ease' }}
                  onClick={() => setSelectedOrderId(order.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '14px 18px', fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>
                    #{order.id.slice(0, 8)}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700 }}>{order.customerName || 'عميل واصل'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--mut)', direction: 'ltr', textAlign: 'right' }}>
                      {order.customerPhone}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    {order.driverName ? (
                      <div>
                        <div style={{ fontWeight: 700, color: '#0284c7' }}>{order.driverName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mut)', direction: 'ltr', textAlign: 'right' }}>
                          {order.driverPhone}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--mut)', fontSize: '0.8rem' }}>في انتظار كابتن...</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 18px' }}>{getStatusChip(order.status)}</td>
                  <td style={{ padding: '14px 18px', fontWeight: 600 }}>{order.stopsCount} محطات</td>
                  <td style={{ padding: '14px 18px', fontWeight: 800, color: 'var(--color-ink)' }}>
                    {order.fare ? formatEgp(order.fare) : order.fareMinor ? formatEgp(order.fareMinor / 100) : '—'}
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--mut)', fontSize: '0.82rem' }}>
                    {new Date(order.createdAt).toLocaleDateString('ar-EG', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        تفاصيل 🔍
                      </Button>

                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            setCancelModalOrderId(order.id);
                            setCancelReason('إلغاء إداري من لوحة التحكم المركزية');
                          }}
                          style={{
                            padding: '5px 10px',
                            fontSize: '0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#dc2626',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          إلغاء 🛑
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

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--mut)' }}>
          عرض {orders.length} من أصل {totalCount} طلب
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
          >
            ⬅️ الصفحة السابقة
          </Button>
          <Button
            variant="outline"
            disabled={orders.length < limit}
            onClick={() => setOffset((prev) => prev + limit)}
          >
            الصفحة التالية ➡️
          </Button>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrderId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '24px',
              padding: '28px',
              maxWidth: '620px',
              width: '92%',
              maxHeight: '88vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>
                  تفاصيل الطلب #{selectedOrderId.slice(0, 8)}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--mut)', fontFamily: 'monospace' }}>
                  {selectedOrderId}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--mut)' }}
              >
                ✕
              </button>
            </div>

            {selectedOrderDetailQuery.isLoading ? (
              <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : selectedOrderDetailQuery.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Status & Fare Banner */}
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>حالة الطلب الحالية</span>
                    <div style={{ marginTop: '4px' }}>{getStatusChip(selectedOrderDetailQuery.data.status)}</div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>الأجرة المعتمدة</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)', marginTop: '2px' }}>
                      {selectedOrderDetailQuery.data.agreement?.agreedFare
                        ? formatEgp(selectedOrderDetailQuery.data.agreement.agreedFare)
                        : formatEgp(selectedOrderDetailQuery.data.minFareMinor / 100)}
                    </div>
                  </div>
                </div>

                {/* Parties Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mut)', fontWeight: 700 }}>👤 العميل</span>
                    <div style={{ fontWeight: 800, marginTop: '4px' }}>
                      {selectedOrderDetailQuery.data.customerName || 'عميل واصل'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#0284c7', direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      {selectedOrderDetailQuery.data.customerPhoneMasked || selectedOrderDetailQuery.data.customerPhone}
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mut)', fontWeight: 700 }}>🛵 الكابتن</span>
                    <div style={{ fontWeight: 800, marginTop: '4px' }}>
                      {selectedOrderDetailQuery.data.agreement?.driverName || 'لم يعين بعد'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#16a34a', direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      {selectedOrderDetailQuery.data.agreement?.driverPhoneMasked || '—'}
                    </div>
                  </div>
                </div>

                {/* Stops List */}
                <div>
                  <h4 style={{ fontWeight: 800, marginBottom: '10px' }}>📍 محطات ومسار الطلب:</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Array.isArray(selectedOrderDetailQuery.data.stops) &&
                      selectedOrderDetailQuery.data.stops.map((stop: OrderStop, index: number) => (
                        <div
                          key={stop.id || index}
                          style={{
                            background: '#f8fafc',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--color-ink)',
                              color: 'var(--color-accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              flexShrink: 0,
                            }}
                          >
                            {index + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                              {stop.actionNameAr || 'محطة خدمة'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '2px' }}>
                              {stop.description || 'لا يوجد وصف للمحطة'}
                            </div>
                            {stop.notes && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--mut)', marginTop: '4px' }}>
                                💡 ملاحظات: {stop.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  {selectedOrderDetailQuery.data.status !== 'completed' &&
                    selectedOrderDetailQuery.data.status !== 'cancelled' && (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setCancelModalOrderId(selectedOrderId);
                          setSelectedOrderId(null);
                        }}
                      >
                        إلغاء الطلب إدارياً 🛑
                      </Button>
                    )}
                  <Button variant="outline" onClick={() => setSelectedOrderId(null)}>
                    إغلاق النافذة
                  </Button>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--mut)' }}>تعذر تحميل بيانات الطلب</p>
            )}
          </div>
        </div>
      )}

      {/* Force Cancel Modal */}
      {cancelModalOrderId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100,
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '20px',
              padding: '26px',
              maxWidth: '460px',
              width: '90%',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626', marginBottom: '8px' }}>
              تأكيد إلغاء الطلب إدارياً 🛑
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--mut)', marginBottom: '14px' }}>
              سيتم إنهاء رحلة الطلب وتحرير الكابتن وتوثيق الإجراء في سجل التدقيق الأمني (Audit Logs).
            </p>

            <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              سبب الإلغاء:
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                marginBottom: '16px',
              }}
              placeholder="اكتب سبب إلغاء المشوار..."
            />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setCancelModalOrderId(null)}>
                تراجع
              </Button>
              <Button
                variant="danger"
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                onClick={() =>
                  cancelMutation.mutate({ orderId: cancelModalOrderId, reason: cancelReason })
                }
              >
                {cancelMutation.isPending ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
