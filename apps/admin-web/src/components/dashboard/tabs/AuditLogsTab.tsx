import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';

interface AuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  userId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

export const AuditLogsTab: React.FC = () => {
  const [entityFilter, setEntityFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const auditQuery = useQuery({
    queryKey: ['admin', 'audit-logs', entityFilter, offset],
    queryFn: () =>
      apiClient.admin.getAuditLogs({
        limit,
        offset,
        entityType: entityFilter || undefined,
      }),
  });

  const logs = Array.isArray(auditQuery.data) ? auditQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
            سجل التدقيق والمراقبة الأمنية (Audit Logs)
          </h2>
          <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
            تتبع غير قابل للتعديل لجميع العمليات الحساسة وتغييرات الأسعار والإعدادات
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setOffset(0);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line, #cbd5e1)',
              background: '#fff',
              fontSize: '0.9rem',
            }}
          >
            <option value="">جميع الكيانات</option>
            <option value="settings">إعدادات المنظومة (settings)</option>
            <option value="pricing_rules">قواعد التسعير (pricing_rules)</option>
            <option value="escalation_rules">مصفوفة التصعيد (escalation_rules)</option>
            <option value="vehicle_types">أنواع المركبات (vehicle_types)</option>
            <option value="verification">التوثيق (verification)</option>
            <option value="disputes">النزاعات (disputes)</option>
          </select>
          <Button variant="outline" onClick={() => auditQuery.refetch()}>
            تحديث 🔄
          </Button>
        </div>
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
        {auditQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
            لا توجد سجلات تدقيق مطابقة
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 14px' }}>التاريخ والوقت</th>
                <th style={{ padding: '12px 14px' }}>العملية</th>
                <th style={{ padding: '12px 14px' }}>نوع الكيان</th>
                <th style={{ padding: '12px 14px' }}>معرّف الكيان</th>
                <th style={{ padding: '12px 14px' }}>المسؤول</th>
                <th style={{ padding: '12px 14px' }}>الحالة السابقة / اللاحقة (Diff)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: AuditLogItem) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', color: 'var(--mut)', whiteSpace: 'nowrap' }}>
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('ar-EG') : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <Chip
                      label={log.action}
                      variant={
                        log.action === 'CREATE' || log.action === 'create'
                          ? 'ok'
                          : log.action === 'UPDATE' || log.action === 'update'
                          ? 'warn'
                          : 'default'
                      }
                    />
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{log.entityType}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {log.entityId ? log.entityId.slice(0, 10) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--mut)', fontSize: '0.8rem' }}>
                    {log.userId ? log.userId.slice(0, 8) : 'نظام'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <details>
                      <summary style={{ cursor: 'pointer', color: '#0284c7', fontWeight: 600 }}>
                        عرض التغيير
                      </summary>
                      <div
                        style={{
                          background: '#f8fafc',
                          padding: '8px',
                          borderRadius: '6px',
                          marginTop: '6px',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          maxHeight: '150px',
                          overflowY: 'auto',
                        }}
                      >
                        {log.beforeState && (
                          <div style={{ color: '#dc2626', marginBottom: '4px' }}>
                            <strong>قبل:</strong> {JSON.stringify(log.beforeState)}
                          </div>
                        )}
                        {log.afterState && (
                          <div style={{ color: '#16a34a' }}>
                            <strong>بعد:</strong> {JSON.stringify(log.afterState)}
                          </div>
                        )}
                        {!log.beforeState && !log.afterState && <div>لا توجد تفاصيل إضافية</div>}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <Button
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
        >
          ⬅️ السابق
        </Button>
        <Button
          variant="outline"
          disabled={logs.length < limit}
          onClick={() => setOffset((prev) => prev + limit)}
        >
          التالي ➡️
        </Button>
      </div>
    </div>
  );
};
