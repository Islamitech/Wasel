import React, { useState, useEffect } from 'react';
import { 
  X, User, ShieldCheck, Car, Award, 
  Check, Edit2, LogOut, Sun, Moon, Zap, Star,
  ShieldAlert, Clock, AlertTriangle
} from 'lucide-react';
import { apiClient } from '../../api.js';
import { DriverAppState, ThemeMode } from '../../types/driver.js';

interface DriverProfileDetails {
  ratingAvg?: number | string;
  completedCount?: number;
  acceptanceRate?: number | string;
  vehicles?: Array<{
    id?: string;
    model?: string;
    plate?: string;
    plateNumber?: string;
    vehicleClass?: string;
    isActive?: boolean;
    isVerified?: boolean;
    [key: string]: unknown;
  }>;
  subscription?: {
    status?: string;
    expiresAt?: string;
    planName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DriverProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: DriverAppState;
  onSelectTheme: (theme: ThemeMode) => void;
  onLogout: () => void;
  onUpdateUser?: (updated: { fullName?: string | null }) => void;
}

export const DriverProfileModal: React.FC<DriverProfileModalProps> = ({
  isOpen,
  onClose,
  state,
  onSelectTheme,
  onLogout,
  onUpdateUser,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'vehicle' | 'subscription'>('profile');
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullName, setFullName] = useState(state.user?.fullName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  
  // Full driver profile details from API
  const [driverData, setDriverData] = useState<DriverProfileDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    setFullName(state.user?.fullName || '');
  }, [state.user?.fullName]);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingDetails(true);
      apiClient.auth.getDriverProfile()
        .then((res: unknown) => {
          setDriverData(res as DriverProfileDetails);
        })
        .catch((err: unknown) => {
          console.warn('Driver profile not loaded:', err);
        })
        .finally(() => {
          setIsLoadingDetails(false);
        });
    }
  }, [isOpen]);

  const handleSaveName = async () => {
    if (!fullName.trim() || fullName.trim() === state.user?.fullName) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const updated = await apiClient.auth.updateMe({ fullName: fullName.trim() });
      if (onUpdateUser && updated) {
        onUpdateUser(updated);
      }
      setSaveSuccessMsg('تم تحديث اسم الكابتن بنجاح');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      setIsEditingName(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ البيانات';
      alert(msg);
    } finally {
      setIsSavingName(false);
    }
  };

  if (!isOpen) return null;

  const vehicle = driverData?.vehicles?.[0] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(18, 48, 43, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
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
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
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
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-brand, #12302b)',
                color: '#f2a20c',
                border: '2px solid #f2a20c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 800,
              }}
            >
              {state.user?.fullName ? state.user.fullName.charAt(0) : 'ك'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-ink, #12302b)' }}>
                {state.user?.fullName || 'كابتن واصل'}
              </h2>
              {state.verification?.status === 'approved' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>
                  <ShieldCheck size={14} />
                  <span>كابتن معتمد • أسطول حدائق الأهرام</span>
                </div>
              ) : state.verification?.status === 'rejected' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#dc2626', fontWeight: 700 }}>
                  <ShieldAlert size={14} />
                  <span>حساب مرفوض من الإدارة</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#d97706', fontWeight: 700 }}>
                  <Clock size={14} />
                  <span>حساب جديد • قيد المراجعة والاعتماد</span>
                </div>
              )}
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
            <span>بيانات الكابتن</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vehicle')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'vehicle' ? '3px solid var(--color-brand, #12302b)' : '3px solid transparent',
              color: activeTab === 'vehicle' ? 'var(--color-brand, #12302b)' : '#6b7280',
              fontWeight: activeTab === 'vehicle' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Car size={16} />
            <span>مركبة التوصيل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subscription')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'subscription' ? '3px solid var(--color-brand, #12302b)' : '3px solid transparent',
              color: activeTab === 'subscription' ? 'var(--color-brand, #12302b)' : '#6b7280',
              fontWeight: activeTab === 'subscription' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Award size={16} />
            <span>الباقة والمحفظة</span>
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* TAB 1: CAPTAIN PROFILE */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status Warning Banner if not approved */}
              {state.verification?.status !== 'approved' && (
                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 800 }}>حسابك بانتظار مراجعة واعتماد الإدارة</div>
                    <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: '2px' }}>
                      لا يمكنك استقبال المشاوير أو التحويل لحالة متصل إلا بعد اعتماد وثائقك من لوحة التحكم.
                    </div>
                  </div>
                </div>
              )}

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

              {/* Stats Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '12px',
                  borderRadius: '16px',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>التقييم العام</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <Star size={16} fill="#f59e0b" />
                    <span>{driverData?.completedCount ? Number(driverData.ratingAvg || 5.0).toFixed(1) : 'جديد'}</span>
                  </div>
                </div>

                <div style={{ borderRight: '1px solid #d1d5db', borderLeft: '1px solid #d1d5db' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>الرحلات المكتملة</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-brand, #12302b)' }}>
                    {driverData?.completedCount || 0}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>نسبة القبول</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#16a34a' }}>
                    {driverData?.completedCount ? `${Number(driverData.acceptanceRate || 100).toFixed(0)}%` : '-'}
                  </div>
                </div>
              </div>

              {/* Name Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px' }}>اسم الكابتن</div>
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
                      placeholder="اسم الكابتن الثلاثي"
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
                        setFullName(state.user?.fullName || '');
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
                      {state.user?.fullName || 'لم يتم تحديد الاسم'}
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
                    {state.user?.phone || 'غير مسجل'}
                  </div>
                  <span
                    style={{
                      backgroundColor: state.verification?.status === 'approved' ? '#dcfce7' : '#fef3c7',
                      color: state.verification?.status === 'approved' ? '#15803d' : '#b45309',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {state.verification?.status === 'approved' ? 'موثق ومعتمد ✓' : 'بانتظار الاعتماد'}
                  </span>
                </div>
              </div>

              {/* Verification Tier */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px' }}>رتبة ومستوى الأمان</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {state.verification?.status === 'approved' ? (
                    <>
                      <ShieldCheck size={20} color="#16a34a" />
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#15803d' }}>
                        {state.verification?.level === 3 ? 'مستوى 3: كابتن معتمد ذهبي (شامل كافة الفئات)' : state.verification?.level === 2 ? 'مستوى 2: كابتن موثق متقدم' : 'مستوى 1: كابتن موثق أساسي (Level 1 Basic)'}
                      </span>
                    </>
                  ) : state.verification?.status === 'rejected' ? (
                    <>
                      <ShieldAlert size={20} color="#dc2626" />
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#b91c1c' }}>
                        طلب التوثيق مرفوض من الإدارة
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock size={20} color="#d97706" />
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#b45309' }}>
                        قيد المراجعة والاعتماد من قبل الإدارة
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Theme Selector */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                  مظهر شاشة الكابتن أثناء القيادة:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => onSelectTheme('light')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: state.theme === 'light' ? 800 : 600,
                      backgroundColor: state.theme === 'light' ? 'var(--color-brand, #12302b)' : '#ffffff',
                      color: state.theme === 'light' ? '#fff' : 'inherit',
                      border: '1px solid #d1d5db',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Sun size={16} />
                    <span>فاتح</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectTheme('dark')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: state.theme === 'dark' ? 800 : 600,
                      backgroundColor: state.theme === 'dark' ? 'var(--color-brand, #12302b)' : '#ffffff',
                      color: state.theme === 'dark' ? '#fff' : 'inherit',
                      border: '1px solid #d1d5db',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Moon size={16} />
                    <span>داكن</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectTheme('sunlight')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: state.theme === 'sunlight' ? 800 : 600,
                      backgroundColor: state.theme === 'sunlight' ? '#f59e0b' : '#ffffff',
                      color: state.theme === 'sunlight' ? '#000' : 'inherit',
                      border: '1px solid #d1d5db',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <Zap size={16} />
                    <span>شمس</span>
                  </button>
                </div>
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
                  marginTop: '6px',
                }}
              >
                <LogOut size={18} />
                <span>تسجيل الخروج من الحساب</span>
              </button>
            </div>
          )}

          {/* TAB 2: VEHICLE CARD */}
          {activeTab === 'vehicle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {vehicle ? (
                <div
                  style={{
                    backgroundColor: 'var(--color-chip, #f3f6f4)',
                    padding: '20px',
                    borderRadius: '18px',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          backgroundColor: '#e2ece7',
                          color: 'var(--color-brand, #12302b)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Car size={22} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>مركبة التوصيل المسجلة</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {vehicle.modelYear ? `موديل ${vehicle.modelYear}` : 'مركبة معتمدة'}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      معتمدة ونشطة ✅
                    </span>
                  </div>

                  {/* License Plate Display */}
                  <div
                    style={{
                      border: '2px solid #1f2937',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>رقم اللوحة المرورية:</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '2px', color: '#111827' }}>
                        {vehicle.plateNumber || '3256'}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1f2937' }}>
                      مصر 🇪🇬
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #d1d5db', paddingBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>نطاق العمل:</span>
                      <span style={{ fontWeight: 700 }}>حدائق الأهرام ومناطق الجيزة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #d1d5db', paddingBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>حالة الفحص الأمني:</span>
                      <span style={{ fontWeight: 700, color: '#16a34a' }}>تم الفحص والاعتماد</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '30px 16px',
                    backgroundColor: 'var(--color-chip, #f3f6f4)',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Car size={44} color="#9ca3af" />
                  <div style={{ fontWeight: 700 }}>
                    {isLoadingDetails ? 'جاري استخراج بيانات المركبة...' : 'بيانات المركبة معتمدة لدى الأسطول'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    المركبة المسجلة برقم اللوحة الخاص بك معتمدة وتعمل بكفاءة على رادار حدائق الأهرام.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUBSCRIPTION & EARNINGS */}
          {activeTab === 'subscription' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Subscription Card */}
              <div
                style={{
                  backgroundColor: 'var(--color-chip, #f3f6f4)',
                  padding: '20px',
                  borderRadius: '18px',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>باقة الاشتراك الحالية</div>
                  <span
                    style={{
                      backgroundColor: '#dcfce7',
                      color: '#15803d',
                      padding: '4px 10px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                    }}
                  >
                    نشط وساري ✓
                  </span>
                </div>

                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-brand, #12302b)' }}>
                  {state.subscription?.planNameAr || 'باقة التجربة المجانية (30 يوماً)'}
                </div>

                <div style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5 }}>
                  {state.subscription?.isTrial
                    ? `متبقي في الفترة التجريبية المجانية: ${state.subscription.remainingDays || 30} يوماً بدون أي استقطاع أو عمولات.`
                    : 'اشتراك الكابتن مفعل بالكامل. استمتع برحلات غير محدودة وأرباح بنسبة 100% لك.'}
                </div>
              </div>

              {/* Today Earnings Card */}
              <div
                style={{
                  backgroundColor: 'rgba(31, 138, 91, 0.08)',
                  padding: '18px',
                  borderRadius: '18px',
                  border: '1.5px solid rgba(31, 138, 91, 0.25)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 600 }}>إجمالي أرباح اليوم:</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--color-ok, #16a34a)', marginTop: '4px' }}>
                    {state.todayEarnings?.formattedTotalEarnings || '0.00 ج.م'}
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>رحلات اليوم:</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                    {state.todayEarnings?.completedTripsCount || 0}
                  </div>
                </div>
              </div>
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
          منصة واصل للكباتن • حدائق الأهرام • إصدار 1.2.0
        </div>
      </div>
    </div>
  );
};
