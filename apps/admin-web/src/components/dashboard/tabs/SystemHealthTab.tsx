import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';

interface StreamEventItem {
  id: string;
  type: string;
  data: any;
  timestamp: string;
}

export const SystemHealthTab: React.FC = () => {
  const [streamEvents, setStreamEvents] = useState<StreamEventItem[]>([]);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Health Overview Query
  const healthQuery = useQuery({
    queryKey: ['admin', 'health', 'overview'],
    queryFn: async () => {
      const start = performance.now();
      const overview = await apiClient.admin.getOverview();
      const latency = Math.round(performance.now() - start);
      return { ...overview, latency };
    },
    refetchInterval: 10000,
  });

  // Subscribe to Realtime SSE Stream
  useEffect(() => {
    let sub: any = null;
    let isActive = true;

    try {
      sub = apiClient.subscribeRealtime({
        onOpen: () => {
          if (isActive) {
            setIsStreamConnected(true);
            setStreamError(null);
          }
        },
        onError: () => {
          if (isActive) {
            setIsStreamConnected(false);
            setStreamError('انقطع الاتصال بقناة البث الحي، جاري إعادة المحاولة تلقائياً...');
          }
        },
        onEvent: (eventName: string, eventData: any) => {
          if (isActive) {
            const newItem: StreamEventItem = {
              id: `${Date.now()}-${Math.random()}`,
              type: eventName,
              data: eventData,
              timestamp: new Date().toLocaleTimeString('ar-EG'),
            };
            setStreamEvents((prev) => [newItem, ...prev.slice(0, 40)]);
          }
        },
      });
    } catch (err: any) {
      setStreamError(err?.message || 'تعذر الاتصال بقناة البث الحي');
    }

    return () => {
      isActive = false;
      if (sub && sub.close) {
        sub.close();
      }
    };
  }, []);

  const handleSimulateEvent = () => {
    const mockTypes = ['order.published', 'driver.offer_submitted', 'agreement.locked', 'driver.location_ping', 'invoice.issued'];
    const chosenType = mockTypes[Math.floor(Math.random() * mockTypes.length)]!;
    const mockEvent: StreamEventItem = {
      id: `${Date.now()}`,
      type: chosenType,
      data: {
        region: 'EG-GZ-HDA',
        zone: 'Hadayek al-Ahram Gate 1',
        actor: 'system_simulation',
        details: 'حدث تشغيلي مباشر عبر قناة SSE',
      },
      timestamp: new Date().toLocaleTimeString('ar-EG'),
    };
    setStreamEvents((prev) => [mockEvent, ...prev.slice(0, 40)]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            صحة المنظومة وقناة البث الحي 📡
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
            مراقبة زمن استجابة الـ API والخدمات السحابية وتدفق أحداث SSE المباشرة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" onClick={handleSimulateEvent} style={{ fontSize: '0.85rem' }}>
            محاكاة حدث فوري 🔔
          </Button>
          <Button variant="outline" onClick={() => healthQuery.refetch()} style={{ fontSize: '0.85rem' }}>
            فحص الاتصال 🔄
          </Button>
        </div>
      </div>

      {/* Services Health Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
        {/* API Gateway */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>بوابة الـ API المركزية</span>
            <Chip label="جاهز ومتصل" variant="ok" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '10px', color: 'var(--color-ink)' }}>
            {healthQuery.data?.latency ? `${healthQuery.data.latency} ms` : '—'}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>زمن الاستجابة (Latency) ممتاز</span>
        </div>

        {/* Database */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>قاعدة بيانات PostGIS</span>
            <Chip label="متصل 🟢" variant="ok" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '10px', color: 'var(--color-ink)' }}>
            PostgreSQL 16
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>فهارس GiST الجغرافية مفعلة</span>
        </div>

        {/* Redis & Cache */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>محرك الطوابير والكاش</span>
            <Chip label="ساري ⚡" variant="ok" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '10px', color: 'var(--color-ink)' }}>
            Redis 7 / BullMQ
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>صندوق الأحداث Transactional Outbox</span>
        </div>

        {/* SSE Stream Status */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--mut)', fontWeight: 700 }}>قناة SSE الحية</span>
            <Chip
              label={isStreamConnected ? 'متصل بالبث' : 'قيد المحاولة'}
              variant={isStreamConnected ? 'ok' : 'warn'}
            />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '10px', color: isStreamConnected ? '#16a34a' : '#d97706' }}>
            {isStreamConnected ? 'Active Stream' : 'Connecting...'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--mut)' }}>تذاكر استهلاك مؤقتة (Single-use)</span>
        </div>
      </div>

      {/* Live SSE Stream Console */}
      <div
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              سجل تدفق الأحداث الفوري (Realtime SSE Terminal)
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>الأحداث الملتقطة: {streamEvents.length}</span>
            <button
              onClick={() => setStreamEvents([])}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#e2e8f0',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              مسح السجل
            </button>
          </div>
        </div>

        {streamError && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '14px' }}>
            ⚠️ {streamError}
          </div>
        )}

        {streamEvents.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📡</div>
            <p style={{ fontWeight: 600 }}>القناة متصلة وفي انتظار أحداث المنظومة...</p>
            <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              أي طلب جديد أو عرض أو اعتماد يظهر هنا فورياً بدون تحديث الصفحة
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {streamEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  borderRight: '3px solid #22c55e',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div>
                  <span style={{ color: '#f2a20c', fontWeight: 700 }}>[{evt.type}]</span>{' '}
                  <span style={{ color: '#cbd5e1' }}>{JSON.stringify(evt.data)}</span>
                </div>
                <span style={{ color: '#64748b', fontSize: '0.75rem', flexShrink: 0 }}>{evt.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
