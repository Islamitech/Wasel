import React, { useState, useEffect } from 'react';
import { 
  X, User, MapPin, Clock, ShieldCheck, Edit2, Check, 
  Plus, Trash2, Sun, Moon, LogOut, Package 
} from 'lucide-react';
import { apiClient } from '../../api.js';
import { UserDto } from '@wasel/api-client';

interface CustomerProfileModalProps {
  user: UserDto;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUser?: (updated: UserDto) => void;
}

interface SavedAddress {
  id: string;
  title: string;
  details: string;
  iconType: 'home' | 'work' | 'pin';
}

const DEFAULT_ADDRESSES: SavedAddress[] = [
  { id: 'addr-1', title: 'المنزل', details: 'حدائق الأهرام - البوابة الأولى (خوفو)', iconType: 'home' },
  { id: 'addr-2', title: 'العمل', details: 'شارع الثروة المعدنية - منطقة هـ', iconType: 'work' },
];

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onLogout,
  onUpdateUser,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'addresses' | 'history'>('profile');
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullName, setFullName] = useState(user.fullName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Saved Addresses state
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => {
    try {
      const saved = localStorage.getItem('wasel_saved_addresses');
      return saved ? JSON.parse(saved) : DEFAULT_ADDRESSES;
    } catch {
      return DEFAULT_ADDRESSES;
    }
  });
  const [newTitle, setNewTitle] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [isAddingAddr, setIsAddingAddr] = useState(false);

  // Orders History state
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Theme
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  });

  useEffect(() => {
    setFullName(user.fullName || '');
  }, [user.fullName]);

  // Load orders history when history tab is opened
  useEffect(() => {
    if (activeTab === 'history') {
      setIsLoadingOrders(true);
      apiClient.orders.list({ limit: 15 })
        .then((res: any) => {
          const list = Array.isArray(res) ? res : res?.items || [];
          setOrders(list);
        })
        .catch((err) => {
          console.error('Failed to fetch orders history:', err);
        })
        .finally(() => {
          setIsLoadingOrders(false);
        });
    }
  }, [activeTab]);

  const handleSaveName = async () => {
    if (!fullName.trim() || fullName.trim() === user.fullName) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const updated = await apiClient.auth.updateMe({ fullName: fullName.trim() });
      if (onUpdateUser && updated) {
        onUpdateUser(updated);
      }
      setSaveSuccessMsg('تم تحديث الاسم بنجاح');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      setIsEditingName(false);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الاسم');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAddAddress = () => {
    if (!newTitle.trim() || !newDetails.trim()) return;
    const newAddr: SavedAddress = {
      id: `addr-${Date.now()}`,
      title: newTitle.trim(),
      details: newDetails.trim(),
      iconType: 'pin',
    };
    const updated = [newAddr, ...addresses];
    setAddresses(updated);
    try {
      localStorage.setItem('wasel_saved_addresses', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
    setNewTitle('');
    setNewDetails('');
    setIsAddingAddr(false);
  };

  const handleDeleteAddress = (id: string) => {
    const updated = addresses.filter((a) => a.id !== id);
    setAddresses(updated);
    try {
      localStorage.setItem('wasel_saved_addresses', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  };

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>مكتمل ✅</span>;
      case 'cancelled':
        return <span style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>ملغي ❌</span>;
      case 'in_progress':
      case 'assigned':
        return <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>قيد التوصيل 🚚</span>;
      default:
        return <span style={{ backgroundColor: '#e2e8f0', color: '#475569', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>{status}</span>;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          backgroundColor: 'var(--color-sheet, #ffffff)',
          color: 'var(--color-ink, #12302b)',
          borderRadius: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeInUp 0.25s ease-out',
          direction: 'rtl',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-card, #fafbfc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-brand, #12302b)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 800,
              }}
            >
              {user.fullName ? user.fullName.charAt(0) : 'ع'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                {user.fullName || 'العميل الكريم'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#6b7280' }}>
                <ShieldCheck size={14} color="#16a34a" />
                <span>حساب موثق في حدائق الأهرام</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            backgroundColor: 'var(--color-sheet, #ffffff)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'profile' ? '3px solid var(--color-brand, #12302b)' : '3px solid transparent',
              color: activeTab === 'profile' ? 'var(--color-brand, #12302b)' : '#6b7280',
              fontWeight: activeTab === 'profile' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <User size={16} />
            <span>بيانات الحساب</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('addresses')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'addresses' ? '3px solid var(--color-brand, #12302b)' : '3px solid transparent',
              color: activeTab === 'addresses' ? 'var(--color-brand, #12302b)' : '#6b7280',
              fontWeight: activeTab === 'addresses' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <MapPin size={16} />
            <span>عناويني المفضلة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'history' ? '3px solid var(--color-brand, #12302b)' : '3px solid transparent',
              color: activeTab === 'history' ? 'var(--color-brand, #12302b)' : '#6b7280',
              fontWeight: activeTab === 'history' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Clock size={16} />
            <span>سجل المشاوير</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {saveSuccessMsg && (
                <div
                  style={{
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={16} />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Name Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px' }}>الاسم بالكامل</div>
                {isEditingName ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid var(--color-brand, #12302b)',
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                      }}
                      placeholder="أدخل اسمك الكريم"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={isSavingName}
                      onClick={handleSaveName}
                      style={{
                        backgroundColor: 'var(--color-brand, #12302b)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Check size={16} />
                      <span>{isSavingName ? '...' : 'حفظ'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFullName(user.fullName || '');
                        setIsEditingName(false);
                      }}
                      style={{
                        backgroundColor: '#e5e7eb',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                      {user.fullName || 'لم يتم تحديد الاسم'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-brand, #12302b)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <Edit2 size={14} />
                      <span>تعديل</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Phone Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px' }}>رقم الهاتف المسجل</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>
                    {user.phone || 'غير مسجل'}
                  </div>
                  <span
                    style={{
                      backgroundColor: '#dcfce7',
                      color: '#15803d',
                      padding: '3px 8px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    موثق بنجاح ✓
                  </span>
                </div>
              </div>

              {/* Region & Zone Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px' }}>منطقة الخدمة والتغطية</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                  <MapPin size={18} color="#f2a20c" />
                  <span>حدائق الأهرام ومحافظة الجيزة</span>
                </div>
              </div>

              {/* Preferences: Theme */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>مظهر التطبيق</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    {isDark ? 'المظهر الليلي مفعّل' : 'المظهر النهاري مفعّل'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  style={{
                    backgroundColor: 'var(--color-sheet, #ffffff)',
                    border: '1px solid #d1d5db',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  <span>{isDark ? 'فاتح' : 'داكن'}</span>
                </button>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '14px',
                  borderRadius: '14px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#fef2f2',
                  color: '#b91c1c',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: '10px',
                }}
              >
                <LogOut size={18} />
                <span>تسجيل الخروج من الحساب</span>
              </button>
            </div>
          )}

          {/* TAB 2: SAVED ADDRESSES */}
          {activeTab === 'addresses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>العناوين المحفوظة لسرعة الطلب</span>
                <button
                  type="button"
                  onClick={() => setIsAddingAddr(!isAddingAddr)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-brand, #12302b)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Plus size={16} />
                  <span>إضافة عنوان جديد</span>
                </button>
              </div>

              {/* Add Address Form */}
              {isAddingAddr && (
                <div
                  style={{
                    backgroundColor: 'var(--color-card, #fafbfc)',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1.5px dashed var(--color-brand, #12302b)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>عنوان جديد:</div>
                  <input
                    type="text"
                    placeholder="اسم العنوان (مثل: البيت، العيادة، محل العمل)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #d1d5db',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="العنوان بالتفصيل (مثل: البوابة الرابعة - عمارة 12 شارع الجيش)"
                    value={newDetails}
                    onChange={(e) => setNewDetails(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #d1d5db',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={handleAddAddress}
                      style={{
                        flex: 1,
                        backgroundColor: 'var(--color-brand, #12302b)',
                        color: '#fff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      حفظ العنوان
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingAddr(false)}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#e5e7eb',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {/* Address List */}
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  style={{
                    backgroundColor: 'var(--color-chip, #f3f6f4)',
                    padding: '14px 16px',
                    borderRadius: '14px',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        backgroundColor: '#e2ece7',
                        color: 'var(--color-brand, #12302b)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MapPin size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{addr.title}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{addr.details}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    aria-label="حذف العنوان"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '6px',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: ORDER HISTORY */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isLoadingOrders ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280' }}>
                  جاري تحميل سجل المشاوير...
                </div>
              ) : orders.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 16px',
                    color: '#6b7280',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Package size={48} strokeWidth={1.5} color="#9ca3af" />
                  <div style={{ fontWeight: 700 }}>لا توجد طلبات سابقة حتى الآن</div>
                  <div style={{ fontSize: '0.85rem', maxWidth: '280px' }}>
                    عند طلبك لأي مشوار أو شراء في حدائق الأهرام، ستظهر فواتيرك وتفاصيل رحلاتك هنا.
                  </div>
                </div>
              ) : (
                orders.map((ord: any) => (
                  <div
                    key={ord.id}
                    style={{
                      backgroundColor: 'var(--color-chip, #f3f6f4)',
                      padding: '14px 16px',
                      borderRadius: '16px',
                      border: '1px solid var(--color-border, #e5e7eb)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                        مشوار #{ord.id ? ord.id.slice(0, 8) : ''}
                      </div>
                      {getStatusBadge(ord.status)}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: '#6b7280' }}>
                        {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--color-brand, #12302b)' }}>
                        {ord.actualFareMinor ? `${(ord.actualFareMinor / 100).toFixed(0)} ج.م` : ord.quotedFareMinor ? `${(ord.quotedFareMinor / 100).toFixed(0)} ج.م (تقديري)` : 'قيد التسعير'}
                      </span>
                    </div>

                    {ord.stops && ord.stops.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#4b5563', borderTop: '1px dashed #d1d5db', paddingTop: '6px', marginTop: '2px' }}>
                        📍 {ord.stops.length} محطات (من {ord.stops[0]?.addressText || 'الموقع الأول'} إلى {ord.stops[ord.stops.length - 1]?.addressText || 'الوجهة'})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border, #e5e7eb)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#9ca3af',
            backgroundColor: 'var(--color-card, #fafbfc)',
          }}
        >
          منصة واصل • حدائق الأهرام والجيزة • إصدار 1.2.0
        </div>
      </div>
    </div>
  );
};
