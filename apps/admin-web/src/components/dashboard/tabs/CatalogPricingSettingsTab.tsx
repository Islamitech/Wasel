import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Field } from '../../ui/Field.js';
import { formatAuthError } from '@wasel/shared';

interface EscalationRule {
  id?: string;
  escalationLevel: number;
  radiusMeters: number;
  timeoutSeconds: number;
}

interface VehicleType {
  id?: string;
  nameAr: string;
  nameEn: string;
  maxWeightKg?: number | null;
  maxVolumeCbm?: number | null;
}

interface PricingRuleItem {
  id?: string;
  key?: string;
  ruleKey?: string;
  basePriceMinor?: number;
  basePrice?: number;
  perKmPriceMinor?: number;
  perKmPrice?: number;
  perMinutePriceMinor?: number;
  perMinutePrice?: number;
  createdAt?: string;
}

interface CatalogPricingSettingsTabProps {
  isAdmin: boolean;
}

export const CatalogPricingSettingsTab: React.FC<CatalogPricingSettingsTabProps> = ({ isAdmin }) => {
  const queryClient = useQueryClient();
  const [activeSubSection, setActiveSubSection] = useState<'settings' | 'pricing' | 'escalation' | 'vehicles'>('settings');

  // Settings state
  const [settingKey, setSettingKey] = useState('matching_radius_meters');
  const [settingValue, setSettingValue] = useState('3000');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // New Pricing Rule state
  const [pricingKey, setPricingKey] = useState('base_delivery_standard');
  const [basePrice, setBasePrice] = useState('20');
  const [kmPrice, setKmPrice] = useState('5');
  const [minutePrice, setMinutePrice] = useState('0.5');

  // New Escalation Rule state
  const [escRank, setEscRank] = useState('1');
  const [escRadius, setEscRadius] = useState('3500');
  const [escTimeout, setEscTimeout] = useState('30');

  // Queries
  const pricingRulesQuery = useQuery({
    queryKey: ['admin', 'pricing-rules'],
    queryFn: () => apiClient.admin.getPricingRules(),
    enabled: activeSubSection === 'pricing',
  });

  const escalationRulesQuery = useQuery({
    queryKey: ['admin', 'escalation-rules'],
    queryFn: () => apiClient.request<EscalationRule[]>('/admin/escalation-rules'),
    enabled: activeSubSection === 'escalation',
  });

  const vehiclesQuery = useQuery({
    queryKey: ['admin', 'vehicle-types'],
    queryFn: () => apiClient.request<VehicleType[]>('/admin/vehicle-types'),
    enabled: activeSubSection === 'vehicles',
  });

  // Mutations
  const updateSettingMutation = useMutation({
    mutationFn: () => {
      let parsedValue: unknown = settingValue;
      try {
        parsedValue = JSON.parse(settingValue);
      } catch {
        // use as string or number
        if (!isNaN(Number(settingValue))) parsedValue = Number(settingValue);
      }
      return apiClient.admin.updateSetting(settingKey, { value: parsedValue });
    },
    onSuccess: () => {
      setStatusMessage({ text: 'تم تحديث الإعدادات وتسجيل العملية في سجل التدقيق بنجاح!', isError: false });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (err) => {
      setStatusMessage({ text: formatAuthError(err), isError: true });
    },
  });

  const createPricingRuleMutation = useMutation({
    mutationFn: () =>
      apiClient.request<Record<string, unknown>>('/admin/pricing-rules', {
        method: 'POST',
        body: JSON.stringify({
          key: pricingKey,
          basePriceMinor: Math.round(parseFloat(basePrice) * 100),
          perKmPriceMinor: Math.round(parseFloat(kmPrice) * 100),
          perMinutePriceMinor: Math.round(parseFloat(minutePrice) * 100),
        }),
      }),
    onSuccess: () => {
      setStatusMessage({ text: 'تم حفظ إصدار جديد من قواعد التسعير وتسجيله في سجل التدقيق!', isError: false });
      queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-rules'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (err) => {
      setStatusMessage({ text: formatAuthError(err), isError: true });
    },
  });

  const createEscalationRuleMutation = useMutation({
    mutationFn: () =>
      apiClient.request<Record<string, unknown>>('/admin/escalation-rules', {
        method: 'POST',
        body: JSON.stringify({
          escalationLevel: parseInt(escRank, 10),
          radiusMeters: parseInt(escRadius, 10),
          timeoutSeconds: parseInt(escTimeout, 10),
        }),
      }),
    onSuccess: () => {
      setStatusMessage({ text: 'تم تحديث مصفوفة التصعيد بنجاح!', isError: false });
      queryClient.invalidateQueries({ queryKey: ['admin', 'escalation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
    onError: (err) => {
      setStatusMessage({ text: formatAuthError(err), isError: true });
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          الإعدادات، التسعير ومصفوفة التصعيد
        </h2>
        <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
          تعديل المعايير التشغيلية للأسطول مع فحص الحالة السابقة واللاحقة عبر سجل التدقيق
        </p>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            background: statusMessage.isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${statusMessage.isError ? '#f87171' : '#86efac'}`,
            color: statusMessage.isError ? '#991b1b' : '#166534',
            fontSize: '0.9rem',
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Sub-nav pills */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line, #e2e8f0)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveSubSection('settings')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubSection === 'settings' ? 'var(--color-ink)' : 'transparent',
            color: activeSubSection === 'settings' ? '#fff' : 'var(--color-ink)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⚙️ إعدادات المنظومة
        </button>
        <button
          onClick={() => setActiveSubSection('pricing')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubSection === 'pricing' ? 'var(--color-ink)' : 'transparent',
            color: activeSubSection === 'pricing' ? '#fff' : 'var(--color-ink)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          💰 قواعد التسعير بالإصدارات
        </button>
        <button
          onClick={() => setActiveSubSection('escalation')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubSection === 'escalation' ? 'var(--color-ink)' : 'transparent',
            color: activeSubSection === 'escalation' ? '#fff' : 'var(--color-ink)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          📈 مصفوفة التصعيد
        </button>
        <button
          onClick={() => setActiveSubSection('vehicles')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubSection === 'vehicles' ? 'var(--color-ink)' : 'transparent',
            color: activeSubSection === 'vehicles' ? '#fff' : 'var(--color-ink)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          🛵 أنواع المركبات
        </button>
      </div>

      {/* 1. Dynamic Settings */}
      {activeSubSection === 'settings' && (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>محرر الإعدادات الديناميكية للمنطقة</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                مفتاح الإعداد (Setting Key):
              </label>
              <select
                value={settingKey}
                onChange={(e) => setSettingKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.9rem',
                }}
              >
                <option value="matching_radius_meters">نصف قطر المطابقة الأولي (matching_radius_meters)</option>
                <option value="offer_expiry_seconds">مهلة قبول العرض بالثواني (offer_expiry_seconds)</option>
                <option value="free_waiting_minutes">دقائق الانتظار المجانية (free_waiting_minutes)</option>
                <option value="max_active_orders_per_driver">الحد الأقصى للطلبات النشطة للكابتن (max_active_orders)</option>
                <option value="min_fare_minor">الحد الأدنى للأجرة (قروش) (min_fare_minor)</option>
              </select>
            </div>

            <Field
              label="القيمة الجديدة (New Value)"
              value={settingValue}
              onChange={(e) => setSettingValue(e.target.value)}
              disabled={!isAdmin}
            />
          </div>

          {isAdmin ? (
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                isLoading={updateSettingMutation.isPending}
                onClick={() => updateSettingMutation.mutate()}
              >
                حفظ التغييرات وتوثيقها في سجل التدقيق
              </Button>
            </div>
          ) : (
            <p style={{ marginTop: '16px', color: '#ea580c', fontSize: '0.85rem' }}>
              ⚠️ وضع القراءة فقط: تعديل الإعدادات يتطلب صلاحية مسؤول نظام (Admin)
            </p>
          )}
        </div>
      )}

      {/* 2. Versioned Pricing Rules */}
      {activeSubSection === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isAdmin && (
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>إصدار نسخة تسعير جديدة (غير قابلة للكتابة فوق السابقة)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <Field label="رمز القاعدة" value={pricingKey} onChange={(e) => setPricingKey(e.target.value)} />
                <Field label="السعر الأساسي (ج.م)" type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
                <Field label="سعر الكيلومتر (ج.م)" type="number" value={kmPrice} onChange={(e) => setKmPrice(e.target.value)} />
                <Field label="سعر الدقيقة (ج.م)" type="number" value={minutePrice} onChange={(e) => setMinutePrice(e.target.value)} />
              </div>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="primary"
                  isLoading={createPricingRuleMutation.isPending}
                  onClick={() => createPricingRuleMutation.mutate()}
                >
                  اعتماد الإصدار الجديد
                </Button>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontWeight: 700, marginBottom: '12px' }}>الإصدارات الحالية لقواعد التسعير:</h4>
            {pricingRulesQuery.isLoading ? (
              <Spinner />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 14px' }}>الرمز</th>
                    <th style={{ padding: '10px 14px' }}>السعر الأساسي</th>
                    <th style={{ padding: '10px 14px' }}>لكل كم</th>
                    <th style={{ padding: '10px 14px' }}>لكل دقيقة</th>
                    <th style={{ padding: '10px 14px' }}>تاريخ الإصدار</th>
                  </tr>
                </thead>
                <tbody>
                  {((pricingRulesQuery.data || []) as PricingRuleItem[]).map((rule: PricingRuleItem, i: number) => (
                    <tr key={rule.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{rule.key || rule.ruleKey}</td>
                      <td style={{ padding: '10px 14px' }}>{rule.basePriceMinor ? rule.basePriceMinor / 100 : rule.basePrice} ج.م</td>
                      <td style={{ padding: '10px 14px' }}>{rule.perKmPriceMinor ? rule.perKmPriceMinor / 100 : rule.perKmPrice} ج.م</td>
                      <td style={{ padding: '10px 14px' }}>{rule.perMinutePriceMinor ? rule.perMinutePriceMinor / 100 : rule.perMinutePrice} ج.م</td>
                      <td style={{ padding: '10px 14px', color: 'var(--mut)', fontSize: '0.8rem' }}>
                        {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString('ar-EG') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 3. Escalation Rules */}
      {activeSubSection === 'escalation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isAdmin && (
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px' }}>إضافة مستوى تصعيد للتوزيع الذكي</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <Field label="المستوى (Escalation Level)" type="number" value={escRank} onChange={(e) => setEscRank(e.target.value)} />
                <Field label="نصف القطر (بالمتر)" type="number" value={escRadius} onChange={(e) => setEscRadius(e.target.value)} />
                <Field label="المهلة قبل التصعيد التالي (بالثواني)" type="number" value={escTimeout} onChange={(e) => setEscTimeout(e.target.value)} />
              </div>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="primary"
                  isLoading={createEscalationRuleMutation.isPending}
                  onClick={() => createEscalationRuleMutation.mutate()}
                >
                  حفظ مستوى التصعيد
                </Button>
              </div>
            </div>
          )}

          <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontWeight: 700, marginBottom: '12px' }}>مصفوفة التصعيد الحالية:</h4>
            {escalationRulesQuery.isLoading ? (
              <Spinner />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 14px' }}>المستوى</th>
                    <th style={{ padding: '10px 14px' }}>نصف القطر</th>
                    <th style={{ padding: '10px 14px' }}>المهلة</th>
                  </tr>
                </thead>
                <tbody>
                  {(escalationRulesQuery.data || []).map((esc: EscalationRule, i: number) => (
                    <tr key={esc.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>مستوى {esc.escalationLevel}</td>
                      <td style={{ padding: '10px 14px' }}>{esc.radiusMeters} متر</td>
                      <td style={{ padding: '10px 14px' }}>{esc.timeoutSeconds} ثانية</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 4. Vehicles */}
      {activeSubSection === 'vehicles' && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontWeight: 700, marginBottom: '12px' }}>فئات مركبات أسطول واصل:</h4>
          {vehiclesQuery.isLoading ? (
            <Spinner />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 14px' }}>الاسم بالعربية</th>
                  <th style={{ padding: '10px 14px' }}>الاسم بالإنجليزية</th>
                  <th style={{ padding: '10px 14px' }}>أقصى وزن (كجم)</th>
                  <th style={{ padding: '10px 14px' }}>أقصى حجم (م³)</th>
                </tr>
              </thead>
              <tbody>
                {(vehiclesQuery.data || []).map((v: VehicleType, i: number) => (
                  <tr key={v.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{v.nameAr}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--mut)' }}>{v.nameEn}</td>
                    <td style={{ padding: '10px 14px' }}>{v.maxWeightKg || '—'} كجم</td>
                    <td style={{ padding: '10px 14px' }}>{v.maxVolumeCbm || '—'} م³</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
