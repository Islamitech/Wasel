import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatEgp, formatAuthError } from '@wasel/shared';

interface SubscriptionItem {
  id: string;
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  driverPhoneRaw?: string;
  driverStatus?: string;
  isOnline?: boolean;
  planName: string;
  priceEgp: number;
  status: string;
  isTrial: boolean;
  startsAt: string;
  expiresAt: string;
  daysRemaining: number;
  isExpiringSoon: boolean;
}

interface SubscriptionsTabProps {
  isAdmin: boolean;
}

export const SubscriptionsTab: React.FC<SubscriptionsTabProps> = ({ isAdmin }) => {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);

  // Grant Form
  const [driverId, setDriverId] = useState('');
  const [planId, setPlanId] = useState('plan_monthly_pro');
  const [isTrialGrant, setIsTrialGrant] = useState(false);
  const [notes, setNotes] = useState('');

  // Payment Form
  const [payAmount, setPayAmount] = useState('150');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [payNotes, setPayNotes] = useState('تحصيل نقدي باليد من الكابتن');

  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const subsQuery = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => apiClient.admin.listSubscriptions(),
  });

  const grantMutation = useMutation({
    mutationFn: (dto: { driverId: string; planId: string; isTrial: boolean; notes?: string }) =>
      apiClient.admin.activateSubscription({
        driverId: dto.driverId.trim(),
        planId: dto.planId,
        isTrial: dto.isTrial,
        reason: dto.notes,
      }),

    onSuccess: () => {
      setIsGrantModalOpen(false);
      setDriverId('');
      setNotes('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setSuccessBanner('✅ تم تفعيل ومنح الاشتراك للكابتن بنجاح!');
      setTimeout(() => setSuccessBanner(null), 5000);
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
      setSuccessBanner('💵 تم تسجيل إيصال الدفع وتأكيده في المنظومة بنجاح!');
      setTimeout(() => setSuccessBanner(null), 5000);
    },
    onError: (err) => {
      setFormError(formatAuthError(err));
    },
  });

  const rawList: SubscriptionItem[] = Array.isArray(subsQuery.data) ? subsQuery.data : [];

  const filteredList = rawList.filter((s) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return s.status === 'active';
    if (filterStatus === 'expiring') return s.isExpiringSoon;
    if (filterStatus === 'trial') return s.isTrial;
    if (filterStatus === 'expired') return s.daysRemaining <= 0 || s.status === 'expired';
    return true;
  });

  const activeCount = rawList.filter((s) => s.status === 'active').length;
  const trialCount = rawList.filter((s) => s.isTrial).length;
  const expiringSoonCount = rawList.filter((s) => s.isExpiringSoon).length;

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            إدارة الاشتراكات والتحصيل المالي 🎫
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '4px' }}>
            متابعة باقات كباتن حدائق الأهرام وتجديد التراخيص وتسجيل الدفع النقدي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {isAdmin && (
            <Button variant="primary" onClick={() => setIsGrantModalOpen(true)} style={{ fontWeight: 800 }}>
              ➕ منح اشتراك جديد
            </Button>
          )}
          <Button variant="outline" onClick={() => subsQuery.refetch()}>
            تحديث 🔄
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--mut)', fontWeight: 600 }}>إجمالي الاشتراكات</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--color-ink)' }}>
            {rawList.length}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>اشتراكات سارية ونشطة</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#16a34a' }}>
            {activeCount}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>فترة تجريبية مجانية</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            {trialCount}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 600 }}>تنتهي خلال ٥ أيام</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: '#ea580c' }}>
            {expiringSoonCount}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'جميع الاشتراكات' },
          { key: 'active', label: '🟢 سارية فقط' },
          { key: 'expiring', label: '⚠️ تنتهي قريباً' },
          { key: 'trial', label: '🎁 تجريبية' },
          { key: 'expired', label: '❌ منتهية' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
              background: filterStatus === f.key ? 'var(--color-ink)' : '#fff',
              color: filterStatus === f.key ? 'var(--color-accent)' : 'var(--color-ink)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {formError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '10px' }}>
          {formError}
        </div>
      )}

      {/* Subscriptions Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {subsQuery.isLoading ? (
          <div style={{ padding: '60px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--mut)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🎫</div>
            <p style={{ fontWeight: 700 }}>لا توجد اشتراكات مسجلة في هذا القسم</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الكابتن</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الهاتف</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الباقة</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>القيمة</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>الحالة</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>المتبقي</th>
                <th style={{ padding: '14px 18px', fontWeight: 700 }}>تاريخ الانتهاء</th>
                {isAdmin && <th style={{ padding: '14px 18px', fontWeight: 700 }}>الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {filteredList.map((sub: SubscriptionItem) => (
                <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                    {sub.driverName || 'كابتن واصل'}
                  </td>
                  <td style={{ padding: '14px 18px', direction: 'ltr', textAlign: 'right', color: 'var(--mut)', fontSize: '0.85rem' }}>
                    {sub.driverPhone || '—'}
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{sub.planName}</span>
                      {sub.isTrial && <Chip label="تجريبي" variant="warn" />}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                    {formatEgp(sub.priceEgp)}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <Chip
                      label={sub.daysRemaining <= 0 ? 'منتهي' : sub.isExpiringSoon ? 'ينتهي قريباً' : 'ساري نشط'}
                      variant={sub.daysRemaining <= 0 ? 'no' : sub.isExpiringSoon ? 'warn' : 'ok'}
                    />
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: sub.isExpiringSoon ? '#ea580c' : '#16a34a' }}>
                    {sub.daysRemaining > 0 ? `${sub.daysRemaining} يوم` : 'منتهي الصلاحية'}
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                    {new Date(sub.expiresAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          variant="primary"
                          style={{ padding: '5px 12px', fontSize: '0.8rem', fontWeight: 700 }}
                          onClick={() => {
                            setSelectedSub(sub);
                            setPayAmount(String(sub.priceEgp || 150));
                            setIsPayModalOpen(true);
                          }}
                        >
                          💵 تسجيل دفعة
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

      {/* Grant Subscription Modal */}
      {isGrantModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setIsGrantModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '24px',
              padding: '28px',
              maxWidth: '520px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '16px' }}>
              منح أو تجديد اشتراك كابتن ➕
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  معرف أو هاتف الكابتن (Driver ID / Phone):
                </label>
                <input
                  type="text"
                  placeholder="أدخل معرف الكابتن أو اختاره من القائمة..."
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  نوع الباقة:
                </label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="plan_monthly_pro">الباقة الشهرية الماسية (150 جنيه / 30 يوم)</option>
                  <option value="plan_weekly">الباقة الأسبوعية المرنة (50 جنيه / 7 أيام)</option>
                  <option value="plan_quarterly">الباقة الربع سنوية (400 جنيه / 90 يوم)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="trialCheck"
                  checked={isTrialGrant}
                  onChange={(e) => setIsTrialGrant(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="trialCheck" style={{ fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', margin: 0 }}>
                  منح كفترة تجريبية مجانية (Trial) بدون تحصيل نقدي
                </label>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  ملاحظات أو مبرر المنح:
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                  }}
                  placeholder="سبب تفعيل الباقة..."
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button variant="outline" onClick={() => setIsGrantModalOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  disabled={!driverId.trim() || grantMutation.isPending}
                  onClick={() =>
                    grantMutation.mutate({
                      driverId,
                      planId,
                      isTrial: isTrialGrant,
                      notes,
                    })
                  }
                >
                  {grantMutation.isPending ? 'جاري التفعيل...' : 'تأكيد منح الاشتراك'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPayModalOpen && selectedSub && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setIsPayModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '24px',
              padding: '28px',
              maxWidth: '480px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>
              تسجيل تحصيل نقدي 💵
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--mut)', marginBottom: '16px' }}>
              تسجيل دفعة للكابتن: <strong>{selectedSub.driverName}</strong> ({selectedSub.planName})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  المبلغ المحصل (بالجنيه المصري):
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  رقم الإيصال أو مرجع السند:
                </label>
                <input
                  type="text"
                  placeholder="مثال: RCP-2026-0042"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  ملاحظات التحصيل:
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button variant="outline" onClick={() => setIsPayModalOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  disabled={payMutation.isPending || !payAmount}
                  onClick={() =>
                    payMutation.mutate({
                      subId: selectedSub.id,
                      amountMinor: Math.round(parseFloat(payAmount) * 100),
                      receiptNumber: receiptNumber || undefined,
                      notes: payNotes,
                    })
                  }
                >
                  {payMutation.isPending ? 'جاري التسجيل...' : 'تأكيد وحفظ الدفعة'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
