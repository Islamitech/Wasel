import React, { useState } from 'react';
import { AdminUser } from '../../types/admin.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { FleetMapTab } from './tabs/FleetMapTab.js';
import { OrdersTab } from './tabs/OrdersTab.js';
import { VerificationsTab } from './tabs/VerificationsTab.js';
import { SubscriptionsTab } from './tabs/SubscriptionsTab.js';
import { SimulatorTab } from './tabs/SimulatorTab.js';
import { SystemHealthTab } from './tabs/SystemHealthTab.js';
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
  | 'fleet'
  | 'orders'
  | 'verifications'
  | 'subscriptions'
  | 'simulator'
  | 'telemetry'
  | 'disputes'
  | 'catalog'
  | 'users'
  | 'audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user.roles.includes('admin');

  const tabs: Array<{ key: TabKey; label: string; icon: string; adminOnly?: boolean; badge?: string }> = [
    { key: 'overview', label: 'نظرة عامة', icon: '📊' },
    { key: 'fleet', label: 'رادار الأسطول والخريطة', icon: '🗺️', badge: 'مباشر' },
    { key: 'orders', label: 'الطلبات والعمليات', icon: '📦' },
    { key: 'verifications', label: 'التوثيق والتحقق', icon: '🛡️' },
    { key: 'subscriptions', label: 'الاشتراكات والتحصيل', icon: '🎫', adminOnly: true },
    { key: 'simulator', label: 'مركز المحاكاة والـ OTP', icon: '⚡', badge: 'سريع' },
    { key: 'telemetry', label: 'صحة المنظومة و SSE', icon: '📡' },
    { key: 'disputes', label: 'فض النزاعات', icon: '⚖️' },
    { key: 'users', label: 'المستخدمون وإدارة الهوية', icon: '👥' },
    { key: 'catalog', label: 'التسعير والإعدادات', icon: '⚙️', adminOnly: true },
    { key: 'audit', label: 'سجل التدقيق الأمني', icon: '📜', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid var(--line, #e2e8f0)',
          padding: '14px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
            }}
            className="mobile-nav-toggle"
          >
            ☰
          </button>

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
              fontSize: '1.4rem',
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(18, 48, 43, 0.2)',
            }}
          >
            و
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-ink, #12302b)', margin: 0 }}>
                منصة واصل — الإدارة المركزية
              </h1>
              <Chip label="نسخة 2.0 المطورة" variant="ok" />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--mut, #5d716c)' }}>
              نطاق العمليات الحي: قطاع حدائق الأهرام ومحافظة الجيزة
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{user.fullName || user.email}</div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
              <Chip
                label={isAdmin ? 'مدير نظام كامل (Super Admin)' : 'فريق الدعم والعمليات'}
                variant={isAdmin ? 'ok' : 'default'}
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={onLogout}
            style={{ padding: '6px 14px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            خروج 🚪
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          maxWidth: '1520px',
          width: '100%',
          margin: '0 auto',
          padding: '24px',
          gap: '24px',
        }}
      >
        {/* Sidebar Nav */}
        <aside
          style={{
            width: '260px',
            flexShrink: 0,
          }}
        >
          <nav
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              position: 'sticky',
              top: '84px',
            }}
          >
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setMobileMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: isActive ? 'var(--color-ink, #12302b)' : '#fff',
                    color: isActive ? 'var(--color-accent, #f2a20c)' : 'var(--color-ink, #12302b)',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    textAlign: 'right',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 4px 12px rgba(18, 48, 43, 0.15)' : '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.15rem' }}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </div>

                  {tab.badge && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        background: isActive ? '#f2a20c' : '#e0f2fe',
                        color: isActive ? '#12302b' : '#0369a1',
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Body */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'fleet' && <FleetMapTab />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'verifications' && <VerificationsTab isAdmin={isAdmin} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab isAdmin={isAdmin} />}
          {activeTab === 'simulator' && <SimulatorTab />}
          {activeTab === 'telemetry' && <SystemHealthTab />}
          {activeTab === 'disputes' && <DisputesTab currentUserId={user.id} />}
          {activeTab === 'catalog' && <CatalogPricingSettingsTab isAdmin={isAdmin} />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'audit' && <AuditLogsTab />}
        </main>
      </div>
    </div>
  );
};
