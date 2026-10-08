import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatAuthError } from '@wasel/shared';

interface DriverItem {
  id: string;
  phone?: string | null;
  fullName?: string | null;
  status: string;
  isActive?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  levelName?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  vehicleTypeName?: string | null;
  vehicleStatus?: string | null;
  docCount?: number;
}

interface VerificationItem {
  id: string;
  userId?: string | null;
  driverId?: string | null;
  docType?: string | null;
  documentType?: string | null;
  status: string;
  createdAt?: string | null;
}

interface VerificationsTabProps {
  isAdmin: boolean;
}

export const VerificationsTab: React.FC<VerificationsTabProps> = ({ isAdmin }) => {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<'drivers' | 'documents'>('drivers');

  // Drivers Filter & Search
  const [driverStatus, setDriverStatus] = useState<string>('pending');
  const [driverSearch, setDriverSearch] = useState<string>('');

  // Documents Filter
  const [docStatus, setDocStatus] = useState<string>('pending');

  // Modals & States
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);
  const [rejectModalDoc, setRejectModalDoc] = useState<VerificationItem | null>(null);
  const [rejectModalDriver, setRejectModalDriver] = useState<DriverItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Query Drivers
  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers', driverStatus],
    queryFn: () => apiClient.admin.listDrivers(driverStatus || undefined),
  });

  // 2. Query Documents
  const verificationsQuery = useQuery({
    queryKey: ['admin', 'verifications', docStatus],
    queryFn: () => apiClient.admin.listVerifications(docStatus || undefined),
    enabled: subTab === 'documents',
  });

  // Driver Mutations
  const approveDriverMutation = useMutation({
    mutationFn: (id: string) => apiClient.admin.approveDriver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
      setSuccessMsg('تم قبول واعتماد الكابتن وتفعيل مركبته ومنحه اشتراكاً تجريبياً بنجاح! أصبح جاهزاً لتلقي المشاوير فوراً 🟢');
      setTimeout(() => setSuccessMsg(null), 6000);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const rejectDriverMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.admin.rejectDriver(id, reason),
    onSuccess: () => {
      setRejectModalDriver(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
      setSuccessMsg('تم رفض طلب تسجيل الكابتن بنجاح.');
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  // Document Mutations
  const approveDocMutation = useMutation({
    mutationFn: (id: string) => apiClient.admin.approveVerification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
      setSuccessMsg('تمت الموافقة على المستند بنجاح');
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const rejectDocMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.admin.rejectVerification(id, reason),
    onSuccess: () => {
      setRejectModalDoc(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const handleViewDoc = async (id: string) => {
    try {
      const res = await apiClient.admin.getVerificationDocumentUrl(id);
      if (res?.downloadUrl) {
        setViewingDocUrl(res.downloadUrl);
      }
    } catch (err) {
      alert('تعذر استخراج رابط المستند: ' + formatAuthError(err));
    }
  };

  const rawDrivers = Array.isArray(driversQuery.data) ? driversQuery.data : [];
  const filteredDrivers = rawDrivers.filter((d: DriverItem) => {
    if (!driverSearch.trim()) return true;
    const term = driverSearch.toLowerCase();
    return (
      d.fullName?.toLowerCase().includes(term) ||
      d.phone?.toLowerCase().includes(term) ||
      d.vehiclePlate?.toLowerCase().includes(term)
    );
  });

  const docList = Array.isArray(verificationsQuery.data) ? verificationsQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and SubTab Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            إدارة تسجيل الكباتن والتوثيق والأسطول
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
            التحكم في طلبات الانضمام، اعتماد المركبات، فحص وثائق الهوية، ومنح التراخيص والاشتراكات
          </p>
        </div>

        {/* SubTab Toggle Buttons */}
        <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: '12px', padding: '4px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setSubTab('drivers')}
            style={{
              padding: '8px 18px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              backgroundColor: subTab === 'drivers' ? '#fff' : 'transparent',
              color: subTab === 'drivers' ? 'var(--color-ink)' : 'var(--mut)',
              boxShadow: subTab === 'drivers' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            🚗 طلبات تسجيل الكباتن ({rawDrivers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('documents')}
            style={{
              padding: '8px 18px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              backgroundColor: subTab === 'documents' ? '#fff' : 'transparent',
              color: subTab === 'documents' ? 'var(--color-ink)' : 'var(--mut)',
              boxShadow: subTab === 'documents' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📄 فحص وثائق الهوية (KYC)
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '14px 16px', borderRadius: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '14px 16px', borderRadius: '10px', fontWeight: 600 }}>
          {actionError}
        </div>
      )}

      {/* SUBTAB 1: DRIVERS REGISTRATION & FLEET APPROVAL */}
      {subTab === 'drivers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flex: 1, maxWidth: '480px' }}>
              <input
                type="text"
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                placeholder="ابحث باسم الكابتن أو الهاتف أو لوحة السيارة..."
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #cbd5e1)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mut)' }}>حالة الكابتن:</label>
              <select
                value={driverStatus}
                onChange={(e) => setDriverStatus(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '1px solid var(--line, #cbd5e1)',
                  background: '#fff',
                  fontSize: '0.9rem',
                }}
              >
                <option value="">جميع الحالات</option>
                <option value="pending">قيد الانتظار والمراجعة ⏳</option>
                <option value="approved">معتمد ومفعل 🟢</option>
                <option value="rejected">مرفوض 🔴</option>
              </select>
              <Button variant="outline" onClick={() => driversQuery.refetch()}>
                تحديث 🔄
              </Button>
            </div>
          </div>

          {/* Drivers Table */}
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-md, 16px)',
              border: '1px solid var(--line, #e2e8f0)',
              overflowX: 'auto',
            }}
          >
            {driversQuery.isLoading ? (
              <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--mut)' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>لا توجد طلبات تسجيل كباتن مطابقة حالياً</p>
                <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>يمكنك تغيير الفلتر أو فحص شاشة "جميع الحالات"</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px' }}>الكابتن</th>
                    <th style={{ padding: '12px 16px' }}>رقم الهاتف</th>
                    <th style={{ padding: '12px 16px' }}>حالة الكابتن</th>
                    <th style={{ padding: '12px 16px' }}>نوع المركبة واللوحة</th>
                    <th style={{ padding: '12px 16px' }}>حالة المركبة</th>
                    <th style={{ padding: '12px 16px' }}>حالة الاتصال</th>
                    <th style={{ padding: '12px 16px' }}>الوثائق</th>
                    <th style={{ padding: '12px 16px' }}>تاريخ التسجيل</th>
                    {isAdmin && <th style={{ padding: '12px 16px', minWidth: '190px' }}>قرار إدارة الحساب</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((driver: DriverItem) => {
                    const isApproved = driver.status === 'approved';
                    const isPending = driver.status === 'pending' || driver.status === 'under_review';
                    const isRejected = driver.status === 'rejected';

                    return (
                      <tr key={driver.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          <div>{driver.fullName || 'كابتن واصل'}</div>
                          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--mut)', fontWeight: 400 }}>
                            {driver.id.slice(0, 8)}...
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', direction: 'ltr', textAlign: 'right', fontWeight: 600 }}>
                          {driver.phone || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Chip
                            label={isApproved ? 'معتمد ومفعّل' : isPending ? 'قيد المراجعة' : 'مرفوض'}
                            variant={isApproved ? 'ok' : isPending ? 'warn' : 'no'}
                          />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{driver.vehicleTypeName || 'مركبة غير محددة'}</div>
                          {driver.vehiclePlate && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-accent, #d97706)', fontWeight: 700 }}>
                              لوحة: {driver.vehiclePlate}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Chip
                            label={driver.vehicleStatus === 'approved' ? 'معتمدة' : 'قيد الانتظار'}
                            variant={driver.vehicleStatus === 'approved' ? 'ok' : 'default'}
                          />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              color: driver.isOnline ? '#16a34a' : '#64748b',
                            }}
                          >
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: driver.isOnline ? '#22c55e' : '#cbd5e1',
                              }}
                            />
                            {driver.isOnline ? 'متصل الآن' : 'غير متصل'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                          {driver.docCount ? `${driver.docCount} مستندات` : 'لا توجد مستندات'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                          {driver.createdAt ? new Date(driver.createdAt).toLocaleDateString('ar-EG') : '—'}
                        </td>

                        {isAdmin && (
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {!isApproved ? (
                                <Button
                                  variant="primary"
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: '0.85rem',
                                    background: '#16a34a',
                                    fontWeight: 700,
                                  }}
                                  isLoading={approveDriverMutation.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `هل توافق على اعتماد الكابتن "${driver.fullName || driver.phone}" وتفعيل مركبته ومنحه 30 يوماً اشتراكاً تجريبياً مجانياً؟`,
                                      )
                                    ) {
                                      approveDriverMutation.mutate(driver.id);
                                    }
                                  }}
                                >
                                  ✅ قبول واعتماد فوري
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '0.8rem',
                                    borderColor: '#cbd5e1',
                                    color: '#475569',
                                  }}
                                  onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من إعادة فحص/اعتماد الكابتن مجدداً؟`)) {
                                      approveDriverMutation.mutate(driver.id);
                                    }
                                  }}
                                >
                                  تحديث الاعتماد 🔄
                                </Button>
                              )}

                              {!isRejected && (
                                <Button
                                  variant="outline"
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '0.85rem',
                                    borderColor: '#dc2626',
                                    color: '#dc2626',
                                  }}
                                  disabled={rejectDriverMutation.isPending}
                                  onClick={() => {
                                    setRejectModalDriver(driver);
                                    setRejectReason('');
                                  }}
                                >
                                  ❌ رفض
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: KYC DOCUMENTS REVIEW */}
      {subTab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mut)' }}>حالة المستند:</label>
            <select
              value={docStatus}
              onChange={(e) => setDocStatus(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px solid var(--line, #cbd5e1)',
                background: '#fff',
                fontSize: '0.9rem',
              }}
            >
              <option value="">كل المستندات</option>
              <option value="pending">في انتظار المراجعة</option>
              <option value="approved">تمت الموافقة</option>
              <option value="rejected">مرفوضة</option>
            </select>
            <Button variant="outline" onClick={() => verificationsQuery.refetch()}>
              تحديث 🔄
            </Button>
          </div>

          {/* Table */}
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-md, 16px)',
              border: '1px solid var(--line, #e2e8f0)',
              overflowX: 'auto',
            }}
          >
            {verificationsQuery.isLoading ? (
              <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                <Spinner />
              </div>
            ) : docList.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
                لا توجد وثائق في قائمة المراجعة حالياً
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px' }}>رقم الكابتن</th>
                    <th style={{ padding: '12px 16px' }}>نوع المستند</th>
                    <th style={{ padding: '12px 16px' }}>الحالة</th>
                    <th style={{ padding: '12px 16px' }}>تاريخ الإرسال</th>
                    <th style={{ padding: '12px 16px' }}>عرض المستند</th>
                    {isAdmin && <th style={{ padding: '12px 16px' }}>قرار الإدارة</th>}
                  </tr>
                </thead>
                <tbody>
                  {docList.map((item: VerificationItem) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {item.userId ? item.userId.slice(0, 10) + '...' : item.driverId?.slice(0, 10) || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {item.docType || item.documentType || 'بطاقة رقم قومي'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Chip
                          label={item.status === 'approved' ? 'معتمد' : item.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                          variant={item.status === 'approved' ? 'ok' : item.status === 'rejected' ? 'no' : 'warn'}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Button
                          variant="outline"
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => handleViewDoc(item.id)}
                        >
                          👁️ فتح المستند
                        </Button>
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button
                              variant="primary"
                              style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#16a34a' }}
                              disabled={item.status === 'approved' || approveDocMutation.isPending}
                              onClick={() => approveDocMutation.mutate(item.id)}
                            >
                              قبول
                            </Button>
                            <Button
                              variant="outline"
                              style={{ padding: '4px 12px', fontSize: '0.8rem', borderColor: '#dc2626', color: '#dc2626' }}
                              disabled={item.status === 'rejected' || rejectDocMutation.isPending}
                              onClick={() => {
                                setRejectModalDoc(item);
                                setRejectReason('');
                              }}
                            >
                              رفض
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Document View Modal */}
      {viewingDocUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setViewingDocUrl(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>معاينة المستند المشفر (رابط مؤقت)</h3>
              <button
                onClick={() => setViewingDocUrl(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ textAlign: 'center', overflow: 'hidden', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <img
                src={viewingDocUrl}
                alt="Verification Document"
                style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <a
                href={viewingDocUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--color-ink)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                }}
              >
                فتح في نافذة مستقلة ↗
              </a>
              <Button variant="outline" onClick={() => setViewingDocUrl(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal (For Documents) */}
      {rejectModalDoc && (
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
          onClick={() => setRejectModalDoc(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '440px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px' }}>
              سبب رفض توثيق المستند
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--mut)', marginBottom: '16px' }}>
              سيتم إرسال هذا السبب إلى الكابتن ليتمكن من تصحيح المستند وإعادة رفعه
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: الصورة غير واضحة / الرخصة منتهية الصلاحية"
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--line, #cbd5e1)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" onClick={() => setRejectModalDoc(null)}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                style={{ background: '#dc2626' }}
                disabled={!rejectReason.trim() || rejectDocMutation.isPending}
                isLoading={rejectDocMutation.isPending}
                onClick={() =>
                  rejectDocMutation.mutate({
                    id: rejectModalDoc.id,
                    reason: rejectReason.trim(),
                  })
                }
              >
                تأكيد الرفض
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal (For Drivers) */}
      {rejectModalDriver && (
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
          onClick={() => setRejectModalDriver(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '440px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px' }}>
              سبب رفض تسجيل الكابتن
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--mut)', marginBottom: '16px' }}>
              يرجى توضيح سبب الرفض للكابتن ({rejectModalDriver.fullName || rejectModalDriver.phone})
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="مثال: بيانات المركبة غير مطابقة / رخصة القيادة غير صالحة"
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--line, #cbd5e1)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" onClick={() => setRejectModalDriver(null)}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                style={{ background: '#dc2626' }}
                disabled={!rejectReason.trim() || rejectDriverMutation.isPending}
                isLoading={rejectDriverMutation.isPending}
                onClick={() =>
                  rejectDriverMutation.mutate({
                    id: rejectModalDriver.id,
                    reason: rejectReason.trim(),
                  })
                }
              >
                تأكيد رفض الكابتن
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
