import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { Field } from '../../ui/Field.js';
import { formatAuthError } from '@wasel/shared';

interface DisputeItem {
  id: string;
  agreementId?: string | null;
  reason?: string | null;
  description?: string | null;
  status: string;
  assignedToId?: string | null;
}

interface DisputesTabProps {
  currentUserId: string;
}

export const DisputesTab: React.FC<DisputesTabProps> = ({ currentUserId }) => {
  const queryClient = useQueryClient();
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [eventNote, setEventNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [refundMinor, setRefundMinor] = useState('0');
  const [actionError, setActionError] = useState<string | null>(null);

  const disputesQuery = useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: () => apiClient.disputes.list(),
  });

  const assignMutation = useMutation({
    mutationFn: (disputeId: string) => apiClient.admin.assignDispute(disputeId, currentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      setActionError(null);
    },
    onError: (err) => setActionError(formatAuthError(err)),
  });

  const addEventMutation = useMutation({
    mutationFn: ({ disputeId, message }: { disputeId: string; message: string }) =>
      apiClient.admin.addDisputeEvent(disputeId, {
        eventType: 'admin_note',
        notes: message,
      }),
    onSuccess: () => {
      setEventNote('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      setActionError(null);
    },
    onError: (err) => setActionError(formatAuthError(err)),
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      disputeId,
      resolutionNotes,
    }: {
      disputeId: string;
      resolutionNotes: string;
      refundCustomerMinor?: number;
    }) =>
      apiClient.admin.resolveDispute(disputeId, {
        resolution: 'resolved',
        resolutionNotes,
        orderOutcome: 'none',
      }),
    onSuccess: () => {
      setSelectedDispute(null);
      setResolutionNote('');
      setRefundMinor('0');
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setActionError(null);
    },
    onError: (err) => setActionError(formatAuthError(err)),
  });


  const disputesList = Array.isArray(disputesQuery.data) ? disputesQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            غرفة فض النزاعات والتحكيم
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
            معالجة الشكاوى بين العملاء والكباتن والتدخل التحكيمي
          </p>
        </div>

        <Button variant="outline" onClick={() => disputesQuery.refetch()}>
          تحديث 🔄
        </Button>
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
        {disputesQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : disputesList.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
            🎉 لا توجد نزاعات مفتوحة حالياً، جميع العمليات تسير بسلاسة!
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px' }}>رقم النزاع</th>
                <th style={{ padding: '12px 16px' }}>رقم الاتفاقية</th>
                <th style={{ padding: '12px 16px' }}>السبب</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>المسؤول المعين</th>
                <th style={{ padding: '12px 16px' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {disputesList.map((disp: DisputeItem) => (
                <tr key={disp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>#{disp.id.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {disp.agreementId ? disp.agreementId.slice(0, 8) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{disp.reason || disp.description || 'خلاف على الحساب / الفاتورة'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Chip
                      label={disp.status === 'resolved' ? 'تم الحل' : 'مفتوح'}
                      variant={disp.status === 'resolved' ? 'ok' : 'no'}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--mut)' }}>
                    {disp.assignedToId ? disp.assignedToId.slice(0, 8) : 'غير معين'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!disp.assignedToId && (
                        <Button
                          variant="outline"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => assignMutation.mutate(disp.id)}
                        >
                          استلام النزاع
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => setSelectedDispute(disp)}
                      >
                        إدارة وحل
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dispute Details / Resolution Modal */}
      {selectedDispute && (
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
          onClick={() => setSelectedDispute(null)}
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
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>تحكيم النزاع #{selectedDispute.id.slice(0, 8)}</h3>
              <button
                onClick={() => setSelectedDispute(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontWeight: 600 }}>تفاصيل الشكوى:</span>
                <p style={{ marginTop: '4px', color: 'var(--color-ink)' }}>
                  {selectedDispute.reason || selectedDispute.description || 'خلاف على تفاصيل الفاتورة أو الأجرة'}
                </p>
              </div>

              {/* Add event / note */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  إضافة تعليق أو مستجد في سجل النزاع:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={eventNote}
                    onChange={(e) => setEventNote(e.target.value)}
                    placeholder="مثال: تم التواصل هاتفياً مع العميل والكابتن..."
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line, #cbd5e1)',
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={!eventNote.trim() || addEventMutation.isPending}
                    onClick={() => addEventMutation.mutate({ disputeId: selectedDispute.id, message: eventNote.trim() })}
                  >
                    تسجيل
                  </Button>
                </div>
              </div>

              {/* Resolve Section */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                <h4 style={{ fontWeight: 700, marginBottom: '8px' }}>إصدار قرار التحكيم النهائي:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Field
                    label="ملخص قرار الحل"
                    placeholder="مثال: تم تسوية الخلاف وإلغاء رسوم الانتظار الإضافية"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    required
                  />

                  <Field
                    label="المبلغ المسترد للعميل (بالجنيه إن وجد)"
                    type="number"
                    value={refundMinor}
                    onChange={(e) => setRefundMinor(e.target.value)}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button variant="outline" onClick={() => setSelectedDispute(null)}>
                      إلغاء
                    </Button>
                    <Button
                      variant="primary"
                      style={{ background: '#16a34a' }}
                      disabled={!resolutionNote.trim() || resolveMutation.isPending}
                      isLoading={resolveMutation.isPending}
                      onClick={() => {
                        const refund = Math.round(parseFloat(refundMinor || '0') * 100);
                        resolveMutation.mutate({
                          disputeId: selectedDispute.id,
                          resolutionNotes: resolutionNote.trim(),
                          refundCustomerMinor: refund > 0 ? refund : undefined,
                        });

                      }}
                    >
                      اعتماد قرار التحكيم وإغلاق النزاع
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
