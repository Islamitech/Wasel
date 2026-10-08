import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../api.js';
import { Spinner } from '../../ui/Spinner.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { formatAuthError } from '@wasel/shared';

interface AdminUserItem {
  id: string;
  phone?: string | null;
  fullName?: string | null;
  roles?: string[];
  role?: string | null;
  status?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export const UsersTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', debouncedSearch],
    queryFn: () => apiClient.admin.searchUsers(debouncedSearch),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiClient.admin.updateUserStatus(userId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatAuthError(err));
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(searchTerm.trim());
  };

  const usersList = Array.isArray(usersQuery.data) ? usersQuery.data : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)' }}>
          بحث المستخدمين وحماية الخصوصية
        </h2>
        <p style={{ color: 'var(--mut)', fontSize: '0.9rem', marginTop: '2px' }}>
          البحث في حسابات العملاء والكباتن مع إخفاء البيانات الحساسة (PII Masking)
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ابحث برقم الهاتف أو الاسم أو المعرّف..."
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--line, #cbd5e1)',
            fontSize: '0.95rem',
          }}
        />
        <Button variant="primary" type="submit">
          🔍 بحث
        </Button>
      </form>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px', borderRadius: '8px' }}>
          {actionError}
        </div>
      )}

      {/* Results Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-md, 16px)',
          border: '1px solid var(--line, #e2e8f0)',
          overflowX: 'auto',
        }}
      >
        {usersQuery.isLoading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : usersList.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)' }}>
            {debouncedSearch ? 'لم يتم العثور على مستخدمين يطابقون البحث' : 'أدخل كلمة بحث واضغط بحث'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px' }}>المعرف</th>
                <th style={{ padding: '12px 16px' }}>رقم الهاتف (مموّه)</th>
                <th style={{ padding: '12px 16px' }}>الاسم</th>
                <th style={{ padding: '12px 16px' }}>الأدوار</th>
                <th style={{ padding: '12px 16px' }}>الحالة</th>
                <th style={{ padding: '12px 16px' }}>تاريخ التسجيل</th>
                <th style={{ padding: '12px 16px' }}>إدارة الحساب</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((user: AdminUserItem) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {user.id ? user.id.slice(0, 8) + '...' : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', direction: 'ltr', textAlign: 'right', fontWeight: 600 }}>
                    {user.phone ? user.phone : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{user.fullName || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {Array.isArray(user.roles) ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {user.roles.map((r: string) => (
                          <Chip key={r} label={r} variant="default" />
                        ))}
                      </div>
                    ) : (
                      user.role || '—'
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Chip
                      label={user.isActive !== false ? 'نشط' : 'محظور'}
                      variant={user.isActive !== false ? 'ok' : 'no'}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--mut)', fontSize: '0.85rem' }}>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Button
                      variant={user.isActive !== false ? 'outline' : 'primary'}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        borderColor: user.isActive !== false ? '#f87171' : undefined,
                        color: user.isActive !== false ? '#dc2626' : undefined,
                      }}
                      isLoading={toggleStatusMutation.isPending}
                      onClick={() => {
                        const targetState = user.isActive === false;
                        const actionName = targetState ? 'تنشيط' : 'حظر وتجميد';
                        if (window.confirm(`هل أنت متأكد من ${actionName} حساب المستخدم؟`)) {
                          toggleStatusMutation.mutate({ userId: user.id, isActive: targetState });
                        }
                      }}
                    >
                      {user.isActive !== false ? '🚫 حظر الحساب' : '✅ تنشيط الحساب'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
