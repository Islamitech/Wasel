import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';

interface FleetDriver {
  id: string;
  fullName: string;
  phone?: string;
  phoneRaw?: string;
  status: string;
  isOnline: boolean;
  inRide: boolean;
  ratingAvg: string | number;
  completedCount: number;
  vehicleTypeName: string;
  vehicleTypeCode: string;
  vehiclePlate: string;
  location: {
    latitude: number;
    longitude: number;
    zoneName: string;
  };
  lastSeen: string;
}

interface FleetResponse {
  timestamp: string;
  center: { latitude: number; longitude: number };
  drivers: FleetDriver[];
}

export const FleetMapTab: React.FC = () => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'in_ride'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<FleetDriver | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fleetQuery = useQuery<FleetResponse>({
    queryKey: ['admin', 'fleet', 'live'],
    queryFn: () => apiClient.admin.getFleetLive(),
    refetchInterval: 12000,
  });

  const drivers = fleetQuery.data?.drivers || [];

  // Filtered drivers
  const filteredDrivers = drivers.filter((d) => {
    if (filterStatus === 'online' && !d.isOnline) return false;
    if (filterStatus === 'in_ride' && !d.inRide) return false;
    if (filterType !== 'all' && d.vehicleTypeCode !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = d.fullName.toLowerCase().includes(q);
      const matchPhone = d.phoneRaw?.includes(q) || d.phone?.includes(q);
      if (!matchName && !matchPhone) return false;
    }
    return true;
  });

  const onlineCount = drivers.filter((d) => d.isOnline).length;
  const inRideCount = drivers.filter((d) => d.inRide).length;

  // Toggle fleet simulation animation
  const handleToggleSimulation = () => {
    setIsSimulating(!isSimulating);
  };

  // Convert lat/lng to relative coordinate percentage inside Hadayek al-Ahram bounding box
  // Lat: 29.965 to 29.990 (Δ ~ 0.025)
  // Lng: 31.100 to 31.135 (Δ ~ 0.035)
  const getMapPosition = (lat: number, lng: number, index: number) => {
    const minLat = 29.965;
    const maxLat = 29.990;
    const minLng = 31.100;
    const maxLng = 31.135;

    let xPercent = ((lng - minLng) / (maxLng - minLng)) * 100;
    let yPercent = (1 - (lat - minLat) / (maxLat - minLat)) * 100;

    if (isSimulating) {
      xPercent += Math.sin(index + Date.now() / 2000) * 4;
      yPercent += Math.cos(index + Date.now() / 2000) * 4;
    }

    return {
      left: `${Math.min(92, Math.max(8, xPercent))}%`,
      top: `${Math.min(90, Math.max(10, yPercent))}%`,
    };
  };

  const getVehicleIcon = (code: string) => {
    switch (code) {
      case 'bicycle':
        return '🚲';
      case 'motorcycle':
        return '🛵';
      case 'tricycle':
        return '🛺';
      case 'half_truck':
        return '🛻';
      case 'jumbo':
        return '🚚';
      default:
        return '🛵';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
              رادار الأسطول والخريطة الحية 🗺️
            </h2>
            <Chip label="بث حي مباشر" variant="ok" />
          </div>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
            المراقبة المركزية لكباتن حدائق الأهرام وتوزيع المركبات الحركي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant={isSimulating ? 'primary' : 'outline'}
            onClick={handleToggleSimulation}
            style={{ fontSize: '0.85rem' }}
          >
            {isSimulating ? 'إيقاف المحاكاة ⏸️' : 'محاكاة حركة الأسطول 🚀'}
          </Button>

          <Button
            variant="outline"
            onClick={() => fleetQuery.refetch()}
            style={{ fontSize: '0.85rem' }}
          >
            تحديث الرادار 🔄
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--mut)', fontWeight: 600 }}>إجمالي كباتن الأسطول</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--color-ink)' }}>
            {drivers.length}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>الكباتن المتصلون (Online)</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#16a34a' }}>
            {onlineCount}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600 }}>في رحلة نشطة (In Ride)</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#0284c7' }}>
            {inRideCount}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--mut)', fontWeight: 600 }}>جاهزون لاستلام طلبات</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            {Math.max(0, onlineCount - inRideCount)}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          background: '#fff',
          padding: '14px 18px',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>الحالة:</span>
          {(['all', 'online', 'in_ride'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: filterStatus === s ? 'var(--color-ink)' : '#f1f5f9',
                color: filterStatus === s ? 'var(--color-accent)' : 'var(--color-ink)',
                transition: 'all 0.15s ease',
              }}
            >
              {s === 'all' ? 'الكل' : s === 'online' ? '🟢 متصل فقط' : '🔵 في رحلة'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>المركبة:</span>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'motorcycle', label: '🛵 موتوسيكل' },
            { id: 'tricycle', label: '🛺 تروسيكل' },
            { id: 'bicycle', label: '🚲 دراجة' },
            { id: 'half_truck', label: '🛻 نص نقل' },
            { id: 'jumbo', label: '🚚 جامبو' },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setFilterType(v.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: filterType === v.id ? 'var(--color-ink)' : '#f1f5f9',
                color: filterType === v.id ? 'var(--color-accent)' : 'var(--color-ink)',
                transition: 'all 0.15s ease',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div style={{ minWidth: '220px' }}>
          <input
            type="text"
            placeholder="بحث عن كابتن باسم أو رقم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '7px 12px',
              fontSize: '0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
            }}
          />
        </div>
      </div>

      {/* Main Map View & Driver Inspector */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* Interactive Radar Canvas Container */}
        <div
          style={{
            flex: '1 1 650px',
            minHeight: '520px',
            position: 'relative',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '2px solid #0f2c25',
            background: 'linear-gradient(135deg, #0e1e1a 0%, #132a24 100%)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          }}
        >
          {/* Radar Grid Overlay Lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'radial-gradient(circle, rgba(242, 162, 12, 0.08) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              pointerEvents: 'none',
            }}
          />

          {/* Sector Landmarks & Gates */}
          <div
            style={{
              position: 'absolute',
              top: '12%',
              left: '20%',
              padding: '6px 12px',
              background: 'rgba(18, 48, 43, 0.85)',
              border: '1px solid #f2a20c',
              borderRadius: '8px',
              color: '#f2a20c',
              fontSize: '0.75rem',
              fontWeight: 800,
              pointerEvents: 'none',
            }}
          >
            🏛️ بوابة حورس (1)
          </div>

          <div
            style={{
              position: 'absolute',
              top: '45%',
              left: '12%',
              padding: '6px 12px',
              background: 'rgba(18, 48, 43, 0.85)',
              border: '1px solid #f2a20c',
              borderRadius: '8px',
              color: '#f2a20c',
              fontSize: '0.75rem',
              fontWeight: 800,
              pointerEvents: 'none',
            }}
          >
            🏛️ بوابة خفرع (2)
          </div>

          <div
            style={{
              position: 'absolute',
              top: '80%',
              left: '30%',
              padding: '6px 12px',
              background: 'rgba(18, 48, 43, 0.85)',
              border: '1px solid #f2a20c',
              borderRadius: '8px',
              color: '#f2a20c',
              fontSize: '0.75rem',
              fontWeight: 800,
              pointerEvents: 'none',
            }}
          >
            🏛️ بوابة منقرع (3)
          </div>

          <div
            style={{
              position: 'absolute',
              top: '15%',
              right: '15%',
              padding: '6px 12px',
              background: 'rgba(18, 48, 43, 0.85)',
              border: '1px solid #f2a20c',
              borderRadius: '8px',
              color: '#f2a20c',
              fontSize: '0.75rem',
              fontWeight: 800,
              pointerEvents: 'none',
            }}
          >
            🏛️ بوابة مينا (4)
          </div>

          <div
            style={{
              position: 'absolute',
              top: '52%',
              left: '46%',
              padding: '4px 10px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              color: '#94a3b8',
              fontSize: '0.7rem',
              fontWeight: 600,
              pointerEvents: 'none',
            }}
          >
            منطقة ك - الضغط العالي
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '18%',
              right: '25%',
              padding: '4px 10px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              color: '#94a3b8',
              fontSize: '0.7rem',
              fontWeight: 600,
              pointerEvents: 'none',
            }}
          >
            منطقة ن - نادي حدائق الأهرام
          </div>

          {/* Loading Indicator */}
          {fleetQuery.isLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20,
              }}
            >
              <Spinner />
            </div>
          )}

          {/* Drivers Pins */}
          {filteredDrivers.map((driver, idx) => {
            const pos = getMapPosition(driver.location.latitude, driver.location.longitude, idx);
            const isSelected = selectedDriver?.id === driver.id;

            return (
              <div
                key={driver.id}
                onClick={() => setSelectedDriver(driver)}
                style={{
                  position: 'absolute',
                  left: pos.left,
                  top: pos.top,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  zIndex: isSelected ? 15 : 10,
                  transition: 'all 0.4s ease',
                }}
              >
                {/* Marker Card */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                >
                  <div
                    style={{
                      width: isSelected ? '46px' : '38px',
                      height: isSelected ? '46px' : '38px',
                      borderRadius: '50%',
                      background: driver.inRide
                        ? '#0284c7'
                        : driver.isOnline
                        ? '#16a34a'
                        : '#475569',
                      border: isSelected ? '3px solid #f2a20c' : '2px solid #ffffff',
                      boxShadow: isSelected
                        ? '0 0 20px #f2a20c'
                        : driver.isOnline
                        ? '0 0 12px rgba(22, 163, 74, 0.6)'
                        : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isSelected ? '1.4rem' : '1.1rem',
                      color: '#fff',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {getVehicleIcon(driver.vehicleTypeCode)}
                  </div>

                  <span
                    style={{
                      background: 'rgba(15, 23, 42, 0.9)',
                      color: isSelected ? '#f2a20c' : '#ffffff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      border: isSelected ? '1px solid #f2a20c' : '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    {driver.fullName.split(' ')[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Driver Drawer / Details Panel */}
        <div
          style={{
            flex: '1 1 320px',
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-ink)' }}>
              بطاقة الكابتن والموقع 🪪
            </h3>
            {selectedDriver && (
              <button
                onClick={() => setSelectedDriver(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  color: 'var(--mut)',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {selectedDriver ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '14px',
                    backgroundColor: 'var(--color-ink)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                  }}
                >
                  {getVehicleIcon(selectedDriver.vehicleTypeCode)}
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedDriver.fullName}</h4>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <Chip
                      label={selectedDriver.inRide ? 'في رحلة حالياً' : selectedDriver.isOnline ? 'متصل وجاهز' : 'غير متصل'}
                      variant={selectedDriver.inRide ? 'warn' : selectedDriver.isOnline ? 'ok' : 'default'}
                    />
                    <Chip label={`★ ${selectedDriver.ratingAvg}`} variant="ok" />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>رقم الهاتف:</span>
                  <strong style={{ direction: 'ltr' }}>{selectedDriver.phoneRaw || selectedDriver.phone}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>نوع المركبة:</span>
                  <strong>{selectedDriver.vehicleTypeName}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>لوحة المركبة:</span>
                  <strong>{selectedDriver.vehiclePlate}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>الموقع التقديري:</span>
                  <strong style={{ color: '#0284c7' }}>{selectedDriver.location.zoneName}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>إجمالي الرحلات:</span>
                  <strong>{selectedDriver.completedCount} رحلة منجزة</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <span style={{ color: 'var(--mut)' }}>آخر نشاط:</span>
                  <span>{new Date(selectedDriver.lastSeen).toLocaleTimeString('ar-EG')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <a
                  href={`tel:${selectedDriver.phoneRaw || ''}`}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#16a34a',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  اتصال بالكابتن 📞
                </a>

                <Button
                  variant="outline"
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  onClick={() => alert(`إحداثيات الكابتن: ${selectedDriver.location.latitude}, ${selectedDriver.location.longitude}`)}
                >
                  نسخ الإحداثيات 📍
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mut)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎯</div>
              <p style={{ fontWeight: 700, marginBottom: '6px' }}>حدد أي كابتن على الخريطة</p>
              <p style={{ fontSize: '0.8rem' }}>انقر على أي رمز لعرض بيانات الكابتن المباشرة والاتصال الفوري به</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
