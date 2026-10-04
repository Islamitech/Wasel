import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatAuthError } from '@wasel/shared';

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
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<VerificationItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  const verificationsQuery = useQuery({
    queryKey: ['admin', 'verifications', selectedStatus],
    queryFn: () => apiClient.admin.listVerifications(selectedStatus || undefined),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.admin.approveVerification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.admin.rejectVerification(id, reason),
    onSuccess: () => {
      setRejectModalItem(null);
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

  const list = Array.isArray(verificationsQuery.data) ? verificationsQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header and Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            مراجعة وتوثيق الكباتن
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
            فحص أوراق الهوية ورخص القيادة والسيارات وفق متطلبات الأمان
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
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
      </div>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '8px' }}>
          {actionError}
        </div>
      )}

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
        ) : list.length === 0 ? (
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
              {list.map((item: VerificationItem) => (
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
                          disabled={item.status === 'approved' || approveMutation.isPending}
                          onClick={() => approveMutation.mutate(item.id)}
                        >
                          قبول
                        </Button>
                        <Button
                          variant="outline"
                          style={{ padding: '4px 12px', fontSize: '0.8rem', borderColor: '#dc2626', color: '#dc2626' }}
                          disabled={item.status === 'rejected' || rejectMutation.isPending}
                          onClick={() => {
                            setRejectModalItem(item);
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

      {/* Reject Reason Modal */}
      {rejectModalItem && (
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
          onClick={() => setRejectModalItem(null)}
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
              سبب رفض توثيق الكابتن
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
              <Button variant="outline" onClick={() => setRejectModalItem(null)}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                style={{ background: '#dc2626' }}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                isLoading={rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({
                    id: rejectModalItem.id,
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
    </div>
  );
};
