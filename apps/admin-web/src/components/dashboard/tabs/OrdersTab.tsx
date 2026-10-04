import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatEgp } from '@wasel/shared';

const STATUS_OPTIONS = [
  { value: '', label: 'جميع الحالات' },
  { value: 'published', label: 'منشور (في الرادار)' },
  { value: 'negotiating', label: 'مفاوضة وعروض' },
  { value: 'agreed', label: 'تم الاتفاق' },
  { value: 'in_progress', label: 'قيد التنفيذ' },
  { value: 'completed', label: 'مكتمل بنجاح' },
  { value: 'cancelled', label: 'ملغى' },
  { value: 'disputed', label: 'نزاع مفتوح' },
];

interface OrderStop {
  id?: string;
  actionCode?: string;
  addressLabel?: string;
  notes?: string;
}

interface OrderItem {
  id: string;
  taskType?: string;
  serviceType?: string;
  status: string;
  stops?: OrderStop[];
  stopsCount?: number;
  fareMinor?: number;
  fare?: number;
  quotedPriceMinor?: number;
  createdAt?: string;
}

export const OrdersTab: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const limit = 15;

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', selectedStatus, offset],
    queryFn: () => apiClient.admin.listOrders({ status: selectedStatus || undefined, limit, offset }),
  });

  const selectedOrderDetailQuery = useQuery({
    queryKey: ['admin', 'order-detail', selectedOrderId],
    queryFn: () => (selectedOrderId ? apiClient.orders.get(selectedOrderId) : null),
    enabled: !!selectedOrderId,
  });

  const orders = Array.isArray(ordersQuery.data?.items)
    ? ordersQuery.data.items
    : Array.isArray(ordersQuery.data)
    ? ordersQuery.data
    : [];

  const totalCount = ordersQuery.data?.total || orders.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filters and search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>تصفية حسب الحالة:</label>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setOffset(0);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 8px)',
              border: '1px solid var(--line, #cbd5e1)',
              background: '#fff',
              fontSize: '0.9rem',
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Button variant="outline" onClick={() => ordersQuery.refetch()}>
          تحديث 🔄
        </Button>
      </div>

      {/* Orders Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-md, 16px)',
          border: '1px solid var(--line, #e2e8f0)',
          overflowX: 'auto',
        }}
      >
        {ordersQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
            لا توجد طلبات مطابقة للمعايير المحددة
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px' }}>رقم الطلب</th>
                <th style={{ padding: '12px 16px' }}>النوع</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>المحطات</th>
                <th style={{ padding: '12px 16px' }}>التسعير / الأجرة</th>
                <th style={{ padding: '12px 16px' }}>التاريخ</th>
                <th style={{ padding: '12px 16px' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: OrderItem) => {
                const stopsCount = Array.isArray(order.stops) ? order.stops.length : order.stopsCount || 0;
                return (
                  <tr
                    key={order.id}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>
                      #{order.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{order.taskType || order.serviceType || 'مشوار'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Chip
                        label={order.status}
                        variant={order.status === 'completed' ? 'ok' : order.status === 'cancelled' ? 'no' : 'warn'}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>{stopsCount} محطات</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {order.fareMinor ? formatEgp(order.fareMinor / 100) : order.fare ? formatEgp(order.fare) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('ar-EG') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Button
                        variant="outline"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                      >
                        تفاصيل
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--mut)' }}>
          عرض {orders.length} من أصل {totalCount} طلب
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
          >
            ⬅️ السابق
          </Button>
          <Button
            variant="outline"
            disabled={orders.length < limit}
            onClick={() => setOffset((prev) => prev + limit)}
          >
            التالي ➡️
          </Button>
        </div>
      </div>

      {/* Order Details Drawer / Modal */}
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
          }}
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '560px',
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>تفاصيل الطلب #{selectedOrderId.slice(0, 8)}</h3>
              <button
                onClick={() => setSelectedOrderId(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {selectedOrderDetailQuery.isLoading ? (
              <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : selectedOrderDetailQuery.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mut)' }}>الحالة:</span>
                  <Chip label={selectedOrderDetailQuery.data.status} variant="ok" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mut)' }}>المعرف الكامل:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{selectedOrderDetailQuery.data.id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mut)' }}>نوع المهمة:</span>
                  <span style={{ fontWeight: 600 }}>{selectedOrderDetailQuery.data.taskType || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mut)' }}>أجرة الطلب المقدرة:</span>
                  <span style={{ fontWeight: 700 }}>
                    {selectedOrderDetailQuery.data.fareMinor ? formatEgp(selectedOrderDetailQuery.data.fareMinor / 100) : '—'}
                  </span>
                </div>

                {/* Stops */}
                {Array.isArray(selectedOrderDetailQuery.data.stops) && (
                  <div>
                    <h4 style={{ fontWeight: 700, margin: '12px 0 8px 0' }}>المحطات المحددة:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedOrderDetailQuery.data.stops.map((stop: OrderStop, index: number) => (
                        <div
                          key={stop.id || index}
                          style={{
                            background: '#f8fafc',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            محطة {index + 1}: {stop.actionCode || 'توصيل'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--mut)' }}>
                            {stop.addressLabel || stop.notes || 'لا توجد ملاحظات'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--mut)' }}>تعذر تحميل تفاصيل الطلب</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
