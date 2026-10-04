import React, { useState } from 'react';
import { AdminUser } from '../../types/admin.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { OrdersTab } from './tabs/OrdersTab.js';
import { VerificationsTab } from './tabs/VerificationsTab.js';
import { SubscriptionsTab } from './tabs/SubscriptionsTab.js';
import { DisputesTab } from './tabs/DisputesTab.js';
import { CatalogPricingSettingsTab } from './tabs/CatalogPricingSettingsTab.js';
import { UsersTab } from './tabs/UsersTab.js';
import { AuditLogsTab } from './tabs/AuditLogsTab.js';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';

interface AdminDashboardProps {
  user: AdminUser;
  onLogout: () => void;
}

type TabKey =
  | 'overview'
  | 'orders'
  | 'verifications'
  | 'subscriptions'
  | 'disputes'
  | 'catalog'
  | 'users'
  | 'audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const isAdmin = user.roles.includes('admin');

  const tabs: Array<{ key: TabKey; label: string; icon: string; adminOnly?: boolean }> = [

    { key: 'overview', label: 'نظرة عامة', icon: '📊' },
    { key: 'orders', label: 'الطلبات الحية', icon: '📦' },
    { key: 'verifications', label: 'التوثيق والتحقق', icon: '🛡️' },
    { key: 'disputes', label: 'فض النزاعات', icon: '⚖️' },
    { key: 'users', label: 'المستخدمون (مموّه)', icon: '👥' },
    { key: 'subscriptions', label: 'الاشتراكات والتحصيل', icon: '🎫', adminOnly: true },
    { key: 'catalog', label: 'التسعير والإعدادات', icon: '⚙️', adminOnly: true },
    { key: 'audit', label: 'سجل التدقيق', icon: '📜', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid var(--line, #e2e8f0)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-ink, #12302b)',
              color: 'var(--color-accent, #f2a20c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              fontWeight: 800,
            }}
          >
            و
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-ink, #12302b)' }}>
              منصة واصل — الإدارة المركزية
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--mut, #5d716c)' }}>
              نطاق العمليات: قطاع حدائق الأهرام والجيزة
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.fullName || user.email}</div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
              <Chip
                label={isAdmin ? 'مدير نظام كامل' : 'فريق الدعم والعمليات'}
                variant={isAdmin ? 'ok' : 'default'}
              />
            </div>
          </div>
          <Button variant="outline" onClick={onLogout} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
            تسجيل الخروج 🚪
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px', gap: '24px' }}>
        {/* Sidebar Nav */}
        <aside style={{ width: '240px', flexShrink: 0 }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm, 10px)',
                    border: 'none',
                    backgroundColor: isActive ? 'var(--color-ink, #12302b)' : 'transparent',
                    color: isActive ? 'var(--color-accent, #f2a20c)' : 'var(--color-ink, #12302b)',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    textAlign: 'right',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Body */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'verifications' && <VerificationsTab isAdmin={isAdmin} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab isAdmin={isAdmin} />}
          {activeTab === 'disputes' && <DisputesTab currentUserId={user.id} />}
          {activeTab === 'catalog' && <CatalogPricingSettingsTab isAdmin={isAdmin} />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'audit' && <AuditLogsTab />}
        </main>
      </div>
    </div>
  );
};
