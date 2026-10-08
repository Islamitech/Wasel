import React, { useState } from 'react';
import { Menu, X, Sun, Moon, Clock, HelpCircle, User, LogOut } from 'lucide-react';
import { UserDto } from '@wasel/api-client';

interface TopMenuProps {
  user: UserDto;
  onLogout: () => void;
  visible: boolean;
  onOpenProfile?: (tab?: 'profile' | 'addresses' | 'history') => void;
}

export const TopMenu: React.FC<TopMenuProps> = ({ user, onLogout, visible, onOpenProfile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  });

  if (!visible) return null;

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  return (
    <>
      {/* Small top-right icon button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="القائمة الرئيسية"
        style={{
          position: 'fixed',
          top: 'calc(16px + var(--safe-top, 0px))',
          right: '16px',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          color: 'var(--color-ink, #12302b)',
          border: '1px solid #d1d5db',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          cursor: 'pointer',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Drawer / Modal Menu */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'flex-start',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '80%',
              maxWidth: '300px',
              height: '100%',
              backgroundColor: 'var(--color-sheet, #ffffff)',
              color: 'var(--color-ink, #12302b)',
              padding: 'calc(24px + var(--safe-top, 0px)) 20px 24px 20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              animation: 'slideRight 0.25s ease-out',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>واصل</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>حدائق الأهرام، الجيزة</div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="إغلاق القائمة"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* User Info (Clickable for Profile) */}
            <div
              onClick={() => {
                setIsOpen(false);
                if (onOpenProfile) onOpenProfile('profile');
              }}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm, 14px)',
                backgroundColor: 'var(--color-chip, #eef3ef)',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                border: '1px solid transparent',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-ink, #12302b)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={18} />
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{user.fullName || 'العميل'}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>عرض وتعديل الملف الشخصي ⚙️</div>
              </div>
            </div>

            {/* Menu Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (onOpenProfile) onOpenProfile('profile');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <User size={18} />
                <span>الملف الشخصي والبيانات</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (onOpenProfile) onOpenProfile('history');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <Clock size={18} />
                <span>سجل المشاوير والفواتير</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
                <span>{isDark ? 'المظهر الفاتح' : 'المظهر الداكن'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  alert('للدعم الفني والاستفسارات: تواصل عبر تيليجرام أو هاتف الدعم المحلي بحدائق الأهرام.');
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm, 14px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <HelpCircle size={18} />
                <span>المساعدة والدعم</span>
              </button>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: 'var(--radius-sm, 14px)',
                border: 'none',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'right',
              }}
            >
              <LogOut size={18} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
