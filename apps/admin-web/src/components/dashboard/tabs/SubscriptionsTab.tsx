import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { Field } from '../../ui/Field.js';
import { formatAuthError } from '@wasel/shared';

interface SubscriptionItem {
  id: string;
  driverId?: string | null;
  planName?: string | null;
  planId?: string | null;
  status?: string | null;
  expiresAt?: string | null;
}

interface SubscriptionsTabProps {
  isAdmin: boolean;
}

export const SubscriptionsTab: React.FC<SubscriptionsTabProps> = ({ isAdmin }) => {
  const queryClient = useQueryClient();
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);

  // Grant Form
  const [driverId, setDriverId] = useState('');
  const [planId, setPlanId] = useState('plan_monthly_pro');
  const [notes, setNotes] = useState('');

  // Payment Form
  const [payAmount, setPayAmount] = useState('150');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [payNotes, setPayNotes] = useState('تحصيل نقدي باليد');

  const [formError, setFormError] = useState<string | null>(null);

  const subsQuery = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => apiClient.admin.listSubscriptions(),
  });

  const grantMutation = useMutation({
    mutationFn: (dto: { driverId: string; planId: string; notes?: string }) =>
      apiClient.admin.activateSubscription({
        driverId: dto.driverId.trim(),
        planId: dto.planId,
        isTrial: false,
        reason: dto.notes,
      }),

    onSuccess: () => {
      setIsGrantModalOpen(false);
      setDriverId('');
      setNotes('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (err) => {
      setFormError(formatAuthError(err));
    },
  });

  const payMutation = useMutation({
    mutationFn: (dto: { subId: string; amountMinor: number; receiptNumber?: string; notes?: string }) =>
      apiClient.admin.recordSubscriptionPayment(dto.subId, {
        amountMinor: dto.amountMinor,
        receiptNumber: dto.receiptNumber,
        notes: dto.notes,
      }),
    onSuccess: () => {
      setIsPayModalOpen(false);
      setSelectedSub(null);
      setReceiptNumber('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
    },
    onError: (err) => {
      setFormError(formatAuthError(err));
    },
  });

  const subsList = Array.isArray(subsQuery.data) ? subsQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            إدارة الاشتراكات والتحصيل
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
            متابعة باقات السائقين وتجديد الاشتراكات وتسجيل الدفع النقدي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {isAdmin && (
            <Button variant="primary" onClick={() => setIsGrantModalOpen(true)}>
              ➕ منح اشتراك جديد
            </Button>
          )}
          <Button variant="outline" onClick={() => subsQuery.refetch()}>
            تحديث 🔄
          </Button>
        </div>
      </div>

      {formError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '8px' }}>
          {formError}
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
        {subsQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : subsList.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
            لا توجد اشتراكات مسجلة حالياً
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px' }}>رقم السائق</th>
                <th style={{ padding: '12px 16px' }}>الباقة</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>تاريخ الانتهاء</th>
                {isAdmin && <th style={{ padding: '12px 16px' }}>الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {subsList.map((sub: SubscriptionItem) => (
                <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {sub.driverId ? sub.driverId.slice(0, 10) + '...' : sub.id.slice(0, 8)}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sub.planName || sub.planId || 'باقة شهرية'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Chip
                      label={sub.status === 'active' ? 'ساري' : sub.status === 'expired' ? 'منتهي' : sub.status || 'ساري'}
                      variant={sub.status === 'active' || !sub.status ? 'ok' : 'warn'}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                    {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ar-EG') : '—'}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '12px 16px' }}>
                      <Button
                        variant="outline"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => {
                          setSelectedSub(sub);
                          setIsPayModalOpen(true);
                        }}
                      >
                        💵 تسجيل دفعة
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant Subscription Modal */}
      {isGrantModalOpen && (
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
          onClick={() => setIsGrantModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '460px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>منح / تفعيل اشتراك سائق</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!driverId.trim()) return;
                grantMutation.mutate({ driverId, planId, notes });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <Field
                label="معرّف السائق (Driver UUID)"
                placeholder="مثال: e2a1b3..."
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                required
              />

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  الباقة المختارة:
                </label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--line, #cbd5e1)',
                    background: '#fff',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="plan_monthly_pro">الباقة الشهرية الاحترافية (150 ج.م)</option>
                  <option value="plan_quarterly">الباقة الربع سنوية (400 ج.م)</option>
                  <option value="plan_trial_7d">فترة تجريبية مجانية (7 أيام)</option>
                </select>
              </div>

              <Field
                label="ملاحظات المنح (اختياري)"
                placeholder="منح عبر الدعم الفني / عرض خاص"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="outline" type="button" onClick={() => setIsGrantModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit" isLoading={grantMutation.isPending}>
                  تفعيل الاشتراك الآن
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPayModalOpen && selectedSub && (
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
          onClick={() => setIsPayModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 'var(--radius-lg, 24px)',
              padding: '24px',
              maxWidth: '460px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>
              تسجيل تحصيل نقدي للاشتراك #{selectedSub.id.slice(0, 8)}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amountMinor = Math.round(parseFloat(payAmount) * 100);
                if (isNaN(amountMinor) || amountMinor <= 0) return;
                payMutation.mutate({
                  subId: selectedSub.id,
                  amountMinor,
                  receiptNumber: receiptNumber.trim() || undefined,
                  notes: payNotes,
                });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <Field
                label="المبلغ المحصل (بالجنيه المصري)"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />

              <Field
                label="رقم إيصال التحصيل أو الوصل الورقي"
                placeholder="REC-2026-001"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />

              <Field
                label="ملاحظات التحصيل"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="outline" type="button" onClick={() => setIsPayModalOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" type="submit" isLoading={payMutation.isPending}>
                  تأكيد تسجيل الدفعة
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
