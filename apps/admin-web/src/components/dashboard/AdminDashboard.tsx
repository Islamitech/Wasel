import React, { useState, useEffect } from 'react';
import {
  AdminOrder,
  AdminOrderState,
  DriverVerificationDoc,
  DriverSubscription,
  DisputeItem,
  PricingConfig,
  WhatIfConfig,
  CatalogItem,
  AdminUser,
} from '../../types/admin.js';

interface AdminDashboardProps {
  user: AdminUser;
  onLogout: () => void;
}

type TabKey = 'dash' | 'orders' | 'drivers' | 'subs' | 'price' | 'cat' | 'disp' | 'set';

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: 'dash', icon: '📊', label: 'نظرة عامة' },
  { key: 'orders', icon: '📦', label: 'الطلبات' },
  { key: 'drivers', icon: '🛵', label: 'الكباتن والتوثيق' },
  { key: 'subs', icon: '🎫', label: 'الاشتراكات' },
  { key: 'price', icon: '💰', label: 'التسعير' },
  { key: 'cat', icon: '🗂️', label: 'الكتالوج' },
  { key: 'disp', icon: '⚖️', label: 'النزاعات' },
  { key: 'set', icon: '⚙️', label: 'الإعدادات والسجل' },
];

const ORDER_STATE_META: Record<AdminOrderState, { label: string; chipClass: string }> = {
  published: { label: 'منشور', chipClass: 'warn' },
  negotiating: { label: 'تفاوض', chipClass: 'warn' },
  agreed: { label: 'متفق عليه', chipClass: 'warn' },
  in_progress: { label: 'قيد التنفيذ', chipClass: 'warn' },
  completed: { label: 'مكتمل', chipClass: 'ok' },
  cancelled: { label: 'ملغى', chipClass: 'no' },
  disputed: { label: 'نزاع', chipClass: 'no' },
};

const INITIAL_ORDERS: AdminOrder[] = [
  {
    id: '#1042',
    customerName: 'منى سعيد',
    driverName: 'محمود علي',
    taskType: 'تسوق',
    state: 'in_progress',
    tier: '200–500',
    fare: 40,
    stops: ['محل كهرباء', 'هايبر ماركت'],
    visits: 2,
    waitingHours: 0,
    invoices: [160, 95],
  },
  {
    id: '#1041',
    customerName: 'أحمد فتحي',
    driverName: 'إسلام جابر',
    taskType: 'توصيل مع تصليح',
    state: 'completed',
    tier: '<200',
    fare: 100,
    stops: ['بيت العميل', 'خياط أحذية'],
    visits: 2,
    waitingHours: 2,
    invoices: [100],
  },
  {
    id: '#1040',
    customerName: 'ريم حسن',
    driverName: '—',
    taskType: 'نقل أثاث',
    state: 'negotiating',
    tier: 'ثلاجة',
    fare: 180,
    stops: ['شقة العميل القديمة', 'شقة جديدة'],
    visits: 0,
    waitingHours: 0,
    invoices: [],
  },
  {
    id: '#1039',
    customerName: 'هبة جلال',
    driverName: 'يوسف راضي',
    taskType: 'تسوق',
    state: 'completed',
    tier: '<200',
    fare: 26,
    stops: ['محل سباكة'],
    visits: 1,
    waitingHours: 0,
    invoices: [160],
  },
  {
    id: '#1038',
    customerName: 'كريم مجدي',
    driverName: '—',
    taskType: 'تسوق',
    state: 'published',
    tier: '500–1000',
    fare: 60,
    stops: ['نجار', 'صانع مفاتيح'],
    visits: 2,
    waitingHours: 0,
    invoices: [],
  },
  {
    id: '#1037',
    customerName: 'سارة نبيل',
    driverName: 'علي رمضان',
    taskType: 'تسوق',
    state: 'disputed',
    tier: '1000–5000',
    fare: 210,
    stops: ['مواد بناء', 'جبس', 'إسمنت', 'نجف'],
    visits: 4,
    waitingHours: 1,
    invoices: [4200],
  },
];

const INITIAL_DOCS: DriverVerificationDoc[] = [
  { id: 'doc-1', name: 'حسام شعبان', vehicle: 'موتوسيكل', level: 1, documentName: 'بطاقة + صورة + رخصة', status: 'pending' },
  { id: 'doc-2', name: 'يوسف راضي', vehicle: 'تروسيكل', level: 1, documentName: 'فيش جنائي', status: 'pending' },
  { id: 'doc-3', name: 'مصطفى فاروق', vehicle: 'موتوسيكل', level: 2, documentName: 'شهادة خلو سوابق', status: 'ok' },
  { id: 'doc-4', name: 'إبراهيم النجار', vehicle: 'نص نقل', level: 3, documentName: 'سجل تجاري / سمعة', status: 'ok' },
];

const INITIAL_SUBS: DriverSubscription[] = [
  { id: 'sub-1', name: 'محمود علي', plan: 'تجريبي 30 يوماً', daysRemaining: 24, isActive: true },
  { id: 'sub-2', name: 'إسلام جابر', plan: 'تجريبي 30 يوماً', daysRemaining: 9, isActive: true },
  { id: 'sub-3', name: 'علي رمضان', plan: 'تجريبي 30 يوماً', daysRemaining: 0, isActive: false },
  { id: 'sub-4', name: 'حسام شعبان', plan: 'تجريبي 30 يوماً', daysRemaining: 30, isActive: true },
];

const INITIAL_DISPUTES: DisputeItem[] = [
  {
    id: 'D-7',
    orderId: '#1037',
    openedBy: 'سارة نبيل',
    reason: 'خلاف على مبلغ الفاتورة',
    status: 'open',
    timeline: ['فُتح النزاع بواسطة العميل', 'طلب إثبات الفاتورة من الكابتن'],
  },
  {
    id: 'D-6',
    orderId: '#1029',
    openedBy: 'كريم مجدي',
    reason: 'تأخر شديد في التسليم',
    status: 'resolved',
    timeline: ['فُتح النزاع', 'تقييم محايد للمسار', 'أُغلق: توجيه تحذير للكابتن'],
  },
];

const INITIAL_VEHICLES: CatalogItem[] = [
  { key: 'bicycle', label: 'دراجة', enabled: true },
  { key: 'motorcycle', label: 'موتوسيكل', enabled: true },
  { key: 'tricycle', label: 'تروسيكل', enabled: true },
  { key: 'half_truck', label: 'نص نقل', enabled: true },
  { key: 'jumbo', label: 'جامبو', enabled: true },
];

const INITIAL_ACTIONS: CatalogItem[] = [
  { key: 'buy', label: 'اطلب من هنا', enabled: true },
  { key: 'pick', label: 'استلم من هنا', enabled: true },
  { key: 'drop', label: 'سلّم هنا', enabled: true },
  { key: 'move', label: 'انقل من هنا', enabled: true },
  { key: 'find', label: 'طلب بلا مكان', enabled: true },
];

interface StoredRegisteredCaptain {
  id: string;
  name: string;
  phone: string;
  vehicle?: string;
  level?: number;
  documentName?: string;
  status?: 'pending' | 'ok';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('dash');
  const [orderFilter, setOrderFilter] = useState<string>('all');

  const [orders, setOrders] = useState<AdminOrder[]>(() => {
    try {
      const stored = localStorage.getItem('wasel_admin_orders');
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return INITIAL_ORDERS;
  });

  const [docs, setDocs] = useState<DriverVerificationDoc[]>(() => {
    try {
      const stored = localStorage.getItem('wasel_registered_captains');
      if (stored) {
        const parsed: StoredRegisteredCaptain[] = JSON.parse(stored);
        if (parsed.length > 0) {
          const mapped: DriverVerificationDoc[] = parsed.map((c) => ({
            id: c.id,
            name: c.name,
            vehicle: c.vehicle || 'موتوسيكل',
            level: c.level || 1,
            documentName: c.documentName || 'بطاقة + صورة + رخصة',
            status: c.status || 'pending',
          }));
          return [...mapped, ...INITIAL_DOCS];
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_DOCS;
  });

  const [subs, setSubs] = useState<DriverSubscription[]>(() => {
    try {
      const stored = localStorage.getItem('wasel_registered_captains');
      if (stored) {
        const parsed: StoredRegisteredCaptain[] = JSON.parse(stored);
        if (parsed.length > 0) {
          const mapped: DriverSubscription[] = parsed.map((c) => ({
            id: 'sub-' + c.id,
            name: c.name,
            plan: 'تجريبي 30 يوماً',
            daysRemaining: 30,
            isActive: true,
          }));
          return [...mapped, ...INITIAL_SUBS];
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_SUBS;
  });

  const [disputes, setDisputes] = useState<DisputeItem[]>(INITIAL_DISPUTES);
  const [pricing, setPricing] = useState<PricingConfig>({ stopPrice: 10, waitingHourPrice: 35, invoicePercentage: 10 });
  const [whatIf, setWhatIf] = useState<WhatIfConfig>({ visits: 2, waitingHours: 2, invoiceTotal: 100 });
  const [vehicles, setVehicles] = useState<CatalogItem[]>(INITIAL_VEHICLES);
  const [mapActions, setMapActions] = useState<CatalogItem[]>(INITIAL_ACTIONS);

  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Driver Form Modal
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverVehicle, setNewDriverVehicle] = useState('موتوسيكل');
  const [newDriverLevel, setNewDriverLevel] = useState(1);

  // New Order Form Modal
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newDriverAssigned, setNewDriverAssigned] = useState('—');
  const [newOrderType, setNewOrderType] = useState('تسوق');
  const [newOrderTier, setNewOrderTier] = useState('200–500');
  const [newOrderFare, setNewOrderFare] = useState(35);
  const [newOrderStops, setNewOrderStops] = useState('محل بقالة, محل خضار');

  // Sync to storage on change
  useEffect(() => {
    try {
      localStorage.setItem('wasel_admin_orders', JSON.stringify(orders));
    } catch {
      // ignore
    }
  }, [orders]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const current = root.dataset.theme;
    root.dataset.theme = current === 'dark' ? 'light' : 'dark';
  };

  const calculateFare = (visits: number, waitHours: number, invoicesSum: number, p: PricingConfig): number => {
    return visits * p.stopPrice + waitHours * p.waitingHourPrice + Math.round((invoicesSum * p.invoicePercentage) / 100);
  };

  const handleReviewDoc = (index: number, approve: boolean) => {
    setDocs((prev) =>
      prev.map((doc, i) => (i === index ? { ...doc, status: approve ? 'ok' : 'pending' } : doc))
    );
    showToast(approve ? 'تم اعتماد المستند وإشعار الكابتن' : 'سُجّل الرفض مع طلب مستند بديل');
  };

  const handleExtendSub = (index: number) => {
    setSubs((prev) =>
      prev.map((sub, i) =>
        i === index ? { ...sub, daysRemaining: sub.daysRemaining + 30, isActive: true } : sub
      )
    );
    showToast('تم تمديد الاشتراك 30 يوماً وتسجيله في سجل التدقيق');
  };

  const handleResolveDispute = (id: string) => {
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: 'resolved', timeline: [...d.timeline, 'أُغلق بقرار الإدارة لصالح العميل'] }
          : d
      )
    );
    setSelectedDispute(null);
    showToast('تم إغلاق النزاع وتسجيل القرار');
  };

  const handleCreateDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim() || !newDriverPhone.trim()) {
      showToast('يرجى إدخال اسم الكابتن ورقم هاتفه');
      return;
    }

    const newDoc: DriverVerificationDoc = {
      id: 'doc-' + Date.now(),
      name: newDriverName.trim(),
      vehicle: newDriverVehicle,
      level: newDriverLevel,
      documentName: newDriverLevel === 2 ? 'فيش جنائي' : 'بطاقة + صورة + رخصة',
      status: 'pending',
    };

    const newSub: DriverSubscription = {
      id: 'sub-' + Date.now(),
      name: newDriverName.trim(),
      plan: 'تجريبي 30 يوماً',
      daysRemaining: 30,
      isActive: true,
    };

    setDocs((prev) => [newDoc, ...prev]);
    setSubs((prev) => [newSub, ...prev]);

    // Persist in localStorage
    try {
      const stored: StoredRegisteredCaptain[] = JSON.parse(
        localStorage.getItem('wasel_registered_captains') || '[]'
      );
      stored.unshift({
        id: newDoc.id,
        name: newDoc.name,
        phone: newDriverPhone.trim(),
        vehicle: newDoc.vehicle,
        level: newDoc.level,
        documentName: newDoc.documentName,
        status: newDoc.status,
      });
      localStorage.setItem('wasel_registered_captains', JSON.stringify(stored));
    } catch {
      // ignore
    }

    setIsAddDriverOpen(false);
    setNewDriverName('');
    setNewDriverPhone('');
    showToast(`تم تسجيل ${newDoc.name} وظهوره في طابور المراجعة والاشتراكات بنجاح`);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      showToast('يرجى إدخال اسم العميل');
      return;
    }

    const stopsArray = newOrderStops
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newOrder: AdminOrder = {
      id: `#${Math.floor(1050 + Math.random() * 900)}`,
      customerName: newCustomerName.trim(),
      driverName: newDriverAssigned.trim() || '—',
      taskType: newOrderType,
      state: 'published',
      tier: newOrderTier,
      fare: newOrderFare,
      stops: stopsArray.length > 0 ? stopsArray : ['نقطة الطلب', 'نقطة التسليم'],
      visits: stopsArray.length || 1,
      waitingHours: 0,
      invoices: [],
    };

    setOrders((prev) => [newOrder, ...prev]);
    setIsAddOrderOpen(false);
    setNewCustomerName('');
    showToast(`تم إنشاء الطلب ${newOrder.id} وظهوره في جدول الطلبات بنجاح`);
  };

  const filteredOrders = orders.filter((o) => orderFilter === 'all' || o.state === orderFilter);

  // 7-day chart mockup data
  const chartDays = [
    { day: 'السبت', count: 18 },
    { day: 'الأحد', count: 26 },
    { day: 'الإثنين', count: 22 },
    { day: 'الثلاثاء', count: 31 },
    { day: 'الأربعاء', count: 28 },
    { day: 'الخميس', count: 35 },
    { day: 'الجمعة', count: orders.length + 36 },
  ];
  const maxDayCount = orders.length + 36;

  return (
    <div className="app">
      {/* Side Navigation */}
      <nav className="admin-nav">
        <h1>
          واصل
          <small>لوحة التحكم المركزية</small>
        </h1>

        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`nav-item ${activeTab === tab.key ? 'on' : ''}`}
            onClick={() => {
              setActiveTab(tab.key);
              setSelectedOrder(null);
              setSelectedDispute(null);
              setIsAddDriverOpen(false);
              setIsAddOrderOpen(false);
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}

        <div className="foot">
          <div>
            <strong>{user.fullName || 'مدير النظام'}</strong>
            <div style={{ fontSize: '10px', opacity: 0.8 }}>مسؤول عام</div>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 0,
              color: '#f87171',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '11px',
            }}
          >
            خروج
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="admin-main">
        {/* Top Header */}
        <header className="head">
          <h2>
            {TABS.find((t) => t.key === activeTab)?.icon} {TABS.find((t) => t.key === activeTab)?.label}
          </h2>
          <div className="sp" />

          {activeTab === 'drivers' && (
            <button className="btn" onClick={() => setIsAddDriverOpen(true)}>
              ＋ تسجيل كابتن جديد
            </button>
          )}

          {activeTab === 'orders' && (
            <button className="btn" onClick={() => setIsAddOrderOpen(true)}>
              ＋ تسجيل طلب جديد
            </button>
          )}

          {activeTab === 'price' && (
            <button
              className="btn"
              onClick={() => showToast('سيسري التعديل على الطلبات الجديدة فقط، ويُحفظ كإصدار مؤرخ')}
            >
              فعّل بتاريخ سريان…
            </button>
          )}

          {activeTab === 'cat' && (
            <button
              className="btn"
              onClick={() => showToast('إضافة عنصر جديد تتم ديناميكياً في قاعدة البيانات دون تعديل كود')}
            >
              ＋ إضافة عنصر
            </button>
          )}

          <button className="chip" onClick={toggleTheme} title="التبديل بين الوضع الليلي والنهاري">
            🌓 مظهر
          </button>
        </header>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'dash' && (
          <div>
            <div className="grid">
              <div className="card kpi">
                <span>طلبات اليوم</span>
                <b>{orders.length + 36}</b>
                <i>▲ 20% عن أمس</i>
              </div>
              <div className="card kpi">
                <span>كباتن مسجلون ونشطون</span>
                <b>{subs.filter((s) => s.isActive).length}</b>
                <i>من {docs.length} كابتن</i>
              </div>
              <div className="card kpi">
                <span>اشتراكات فعالة</span>
                <b>{subs.filter((s) => s.isActive).length}</b>
                <span>{subs.filter((s) => s.daysRemaining <= 7 && s.isActive).length} تنتهي قريباً</span>
              </div>
              <div className="card kpi">
                <span>نزاعات مفتوحة</span>
                <b style={{ color: 'var(--no)' }}>{disputes.filter((d) => d.status === 'open').length}</b>
                <span>تحتاج مراجعتك</span>
              </div>
            </div>

            <div className="two">
              <div className="card">
                <h3>حجم الطلبات آخر 7 أيام</h3>
                <div className="bars">
                  {chartDays.map((item) => (
                    <div key={item.day}>
                      <i style={{ height: `${(item.count / maxDayCount) * 110}px` }} />
                      <span>{item.day[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3>يحتاج إجراءً منك (Triage)</h3>
                <div className="line">
                  <span>مستندات بانتظار المراجعة</span>
                  <button className="chip warn" onClick={() => setActiveTab('drivers')}>
                    {docs.filter((d) => d.status === 'pending').length} مستند
                  </button>
                </div>
                <div className="line">
                  <span>نزاع مفتوح للبت فيه</span>
                  <button className="chip no" onClick={() => setActiveTab('disp')}>
                    {disputes.filter((d) => d.status === 'open').length} مفتوح
                  </button>
                </div>
                <div className="line">
                  <span>اشتراك منتهٍ يحتاج تمديد</span>
                  <button className="chip" onClick={() => setActiveTab('subs')}>
                    {subs.filter((s) => !s.isActive).length} منتهٍ
                  </button>
                </div>
                <div className="line">
                  <span>طلبات بلا سائق منذ +10 د</span>
                  <button className="chip warn" onClick={() => setActiveTab('orders')}>
                    {orders.filter((o) => o.state === 'published').length} طلب
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>أحدث الطلبات في هضبة الأهرام</h3>
              <div className="wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>الرقم</th>
                      <th>العميل</th>
                      <th>الخدمة</th>
                      <th>الأجرة التقديرية</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id} className="click" onClick={() => setSelectedOrder(o)}>
                        <td>
                          <strong>{o.id}</strong>
                        </td>
                        <td>{o.customerName}</td>
                        <td>{o.taskType}</td>
                        <td>{o.fare} ج</td>
                        <td>
                          <span className={`chip ${ORDER_STATE_META[o.state].chipClass}`}>
                            {ORDER_STATE_META[o.state].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ORDERS */}
        {activeTab === 'orders' && (
          <div className="card">
            <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className={`chip ${orderFilter === 'all' ? 'on' : ''}`}
                onClick={() => setOrderFilter('all')}
              >
                الكل ({orders.length})
              </button>
              {(Object.keys(ORDER_STATE_META) as AdminOrderState[]).map((st) => (
                <button
                  key={st}
                  className={`chip ${orderFilter === st ? 'on' : ''}`}
                  onClick={() => setOrderFilter(st)}
                >
                  {ORDER_STATE_META[st].label} (
                  {orders.filter((o) => o.state === st).length})
                </button>
              ))}
            </div>

            <div className="wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>العميل</th>
                    <th>الكابتن</th>
                    <th>الخدمة</th>
                    <th>فئة القيمة</th>
                    <th>الأجرة التقديرية</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="click" onClick={() => setSelectedOrder(o)}>
                      <td>
                        <strong>{o.id}</strong>
                      </td>
                      <td>{o.customerName}</td>
                      <td>{o.driverName}</td>
                      <td>{o.taskType}</td>
                      <td>{o.tier}</td>
                      <td>
                        <strong>{o.fare} ج</strong>
                      </td>
                      <td>
                        <span className={`chip ${ORDER_STATE_META[o.state].chipClass}`}>
                          {ORDER_STATE_META[o.state].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DRIVERS & VERIFICATION */}
        {activeTab === 'drivers' && (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3>طابور مراجعة مستندات الكباتن ({docs.length})</h3>
                <button className="btn" onClick={() => setIsAddDriverOpen(true)}>
                  ＋ تسجيل كابتن جديد
                </button>
              </div>
              <div className="wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>اسم الكابتن</th>
                      <th>نوع المركبة</th>
                      <th>المستند المرفق</th>
                      <th>مستوى التوثيق</th>
                      <th>الإجراء الإداري</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, idx) => (
                      <tr key={doc.id}>
                        <td>
                          <strong>{doc.name}</strong>
                        </td>
                        <td>{doc.vehicle}</td>
                        <td>{doc.documentName}</td>
                        <td>
                          <span className="chip">مستوى {doc.level}</span>
                        </td>
                        <td>
                          {doc.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn ok" onClick={() => handleReviewDoc(idx, true)}>
                                اعتمد
                              </button>
                              <button className="btn no" onClick={() => handleReviewDoc(idx, false)}>
                                ارفض
                              </button>
                            </div>
                          ) : (
                            <span className="chip ok">معتمد وموثق</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>مستويات توثيق الكباتن في واصل</h3>
              <div className="three">
                <div className="card">
                  <b>مستوى 1: أساسي</b>
                  <p className="mut">بطاقة الرقم القومي + صورة شخصية + رخصة المركبة. مؤهل لطلبات الفئتين الأولى والثانية (&lt; 500 ج).</p>
                </div>
                <div className="card">
                  <b>مستوى 2: فيش وتشبيه جنائي</b>
                  <p className="mut">صحيفة الحالة الجنائية سارية. مؤهل لكل فئات القيمة وطلبات المنازل ونقل المقتنيات الخاصة.</p>
                </div>
                <div className="card">
                  <b>مستوى 3: السمعة والثقة</b>
                  <p className="mut">أكثر من 50 طلباً بتقييم 4.8+. يحصل على أولوية الظهور والإسناد المباشر من العملاء.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS */}
        {activeTab === 'subs' && (
          <div>
            <div className="grid">
              <div className="card">
                <b>تجريبي (30 يوماً)</b>
                <p className="mut">مجاني تماماً · الباقة الافتراضية التلقائية لجميع الكباتن الجدد عند التسجيل.</p>
              </div>
              <div className="card">
                <b>شهري (مدفوع)</b>
                <p className="mut">السعر يُحدَّد ويفعل كبيانات لاحقاً حسب ديناميكية العرض والطلب في حدائق الأهرام.</p>
              </div>
              <div className="card">
                <b>أسبوعي (مرن)</b>
                <p className="mut">سعر رمزي لتمكين العمل الجزئي في عطلات نهاية الأسبوع ومواسم الأعياد.</p>
              </div>
            </div>

            <div className="card">
              <h3>سجل اشتراكات الكباتن ({subs.length})</h3>
              <div className="wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>الكابتن</th>
                      <th>الباقة الحالية</th>
                      <th>المدة المتبقية</th>
                      <th>حالة الاشتراك</th>
                      <th>إجراء التمديد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s, idx) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td>{s.plan}</td>
                        <td>{s.daysRemaining} يوماً</td>
                        <td>
                          {s.isActive ? (
                            <span className="chip ok">فعّال</span>
                          ) : (
                            <span className="chip no">منتهٍ</span>
                          )}
                        </td>
                        <td>
                          <button className="btn alt" onClick={() => handleExtendSub(idx)}>
                            تمديد 30 يوماً
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mut" style={{ marginTop: '12px' }}>
                💡 <strong>مبدأ الوساطة الخالصة:</strong> لا تمر أموال الاشتراكات عبر بوابة دفع برمجية، بل تُسجل بالتحقق اليدوي الخارجي (إنستاباي / محفظة الهاتف).
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: PRICING & WHAT-IF SIMULATOR */}
        {activeTab === 'price' && (
          <div className="two">
            <div className="card">
              <h3>معادلة التسعير النشطة</h3>
              <div className="three">
                <div>
                  <label>سعر الزيارة الواحدة (ج)</label>
                  <input
                    type="number"
                    value={pricing.stopPrice}
                    onChange={(e) => setPricing({ ...pricing, stopPrice: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label>ساعة الانتظار (ج)</label>
                  <input
                    type="number"
                    value={pricing.waitingHourPrice}
                    onChange={(e) =>
                      setPricing({ ...pricing, waitingHourPrice: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label>نسبة الفواتير (%)</label>
                  <input
                    type="number"
                    value={pricing.invoicePercentage}
                    onChange={(e) =>
                      setPricing({ ...pricing, invoicePercentage: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <p className="mut" style={{ marginTop: '10px' }}>
                كل تعديل يُحفظ كإصدار مؤرخ في <code>app.pricing_rules</code> مع تاريخ سريان، ولا يتم تعديل أو استبدال الأسعار القديمة أبداً.
              </p>

              <h3 style={{ marginTop: '18px' }}>سجل الإصدارات المعتمدة</h3>
              <div className="line">
                <span>الإصدار 1 (الافتراضي) · زيارة 10 ج · انتظار 35 ج/ساعة · نسبة 10%</span>
                <span className="chip ok">فعّال ونشط</span>
              </div>
            </div>

            <div className="card">
              <h3>محاكي التسعير الفوري ("ماذا لو")</h3>
              <div className="three">
                <div>
                  <label>عدد الزيارات الفعلي</label>
                  <input
                    type="number"
                    value={whatIf.visits}
                    onChange={(e) => setWhatIf({ ...whatIf, visits: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label>ساعات الانتظار المطلوبة</label>
                  <input
                    type="number"
                    value={whatIf.waitingHours}
                    onChange={(e) => setWhatIf({ ...whatIf, waitingHours: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label>إجمالي فواتير المشتريات (ج)</label>
                  <input
                    type="number"
                    value={whatIf.invoiceTotal}
                    onChange={(e) => setWhatIf({ ...whatIf, invoiceTotal: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="line">
                  <span>بند الزيارات ({whatIf.visits} × {pricing.stopPrice} ج)</span>
                  <b>{whatIf.visits * pricing.stopPrice} ج</b>
                </div>
                <div className="line">
                  <span>بند الانتظار ({whatIf.waitingHours} × {pricing.waitingHourPrice} ج)</span>
                  <b>{whatIf.waitingHours * pricing.waitingHourPrice} ج</b>
                </div>
                <div className="line">
                  <span>بند نسبة الفواتير ({pricing.invoicePercentage}% من {whatIf.invoiceTotal} ج)</span>
                  <b>{Math.round((whatIf.invoiceTotal * pricing.invoicePercentage) / 100)} ج</b>
                </div>
                <div className="line" style={{ borderTop: '2px solid var(--line)', marginTop: '8px' }}>
                  <b style={{ fontSize: '15px' }}>صافي أجرة الكابتن المستحقة</b>
                  <b style={{ fontSize: '22px', color: 'var(--color-accent, #f2a20c)' }}>
                    {calculateFare(whatIf.visits, whatIf.waitingHours, whatIf.invoiceTotal, pricing)} ج
                  </b>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: CATALOG */}
        {activeTab === 'cat' && (
          <div>
            <div className="two">
              <div className="card">
                <h3>أنواع المركبات المعتمدة</h3>
                <div className="wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>الرمز البرمجي</th>
                        <th>اسم المركبة</th>
                        <th>الحالة في التطبيق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v, i) => (
                        <tr key={v.key}>
                          <td><code>{v.key}</code></td>
                          <td><strong>{v.label}</strong></td>
                          <td>
                            <button
                              className={`chip ${v.enabled ? 'ok' : 'no'}`}
                              onClick={() => {
                                setVehicles((prev) =>
                                  prev.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item))
                                );
                                showToast(`تم ${v.enabled ? 'تعطيل' : 'تفعيل'} مركبة ${v.label}`);
                              }}
                            >
                              {v.enabled ? 'مفعّل ونشط' : 'معطّل مؤقتاً'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <h3>إجراءات الضغط المطول على الخريطة</h3>
                <div className="wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>المفتاح</th>
                        <th>نص الزر في واجهة العميل</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapActions.map((a, i) => (
                        <tr key={a.key}>
                          <td><code>{a.key}</code></td>
                          <td><strong>{a.label}</strong></td>
                          <td>
                            <button
                              className={`chip ${a.enabled ? 'ok' : 'no'}`}
                              onClick={() => {
                                setMapActions((prev) =>
                                  prev.map((item, idx) => (idx === i ? { ...item, enabled: !item.enabled } : item))
                                );
                                showToast(`تم ${a.enabled ? 'تعطيل' : 'تفعيل'} إجراء "${a.label}"`);
                              }}
                            >
                              {a.enabled ? 'متاح للعملاء' : 'مخفي'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>شرائح القيمة التقديرية للطلبات (Value Tiers)</h3>
              <p className="mut" style={{ marginBottom: '10px' }}>
                يختار العميل إحدى هذه الفئات لربط الطلب بمستوى توثيق الكابتن المناسب وحجم المركبة.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="chip">أقل من 200 ج</span>
                <span className="chip">200 – 500 ج</span>
                <span className="chip">500 – 1000 ج</span>
                <span className="chip">1000 – 5000 ج</span>
                <span className="chip">أكثر من 5000 ج</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: DISPUTES */}
        {activeTab === 'disp' && (
          <div className="card">
            <h3>سجل النزاعات والشكاوى</h3>
            <div className="wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>رقم النزاع</th>
                    <th>رقم الطلب</th>
                    <th>الجهة الشاكية</th>
                    <th>سبب النزاع</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="click" onClick={() => setSelectedDispute(d)}>
                      <td><strong>{d.id}</strong></td>
                      <td>{d.orderId}</td>
                      <td>{d.openedBy}</td>
                      <td>{d.reason}</td>
                      <td>
                        <span className={`chip ${d.status === 'open' ? 'no' : 'ok'}`}>
                          {d.status === 'open' ? 'نزاع مفتوح' : 'مُغلق ومحلول'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: SETTINGS & AUDIT LOG */}
        {activeTab === 'set' && (
          <div className="two">
            <div className="card">
              <h3>إعدادات المنصة التشغيلية</h3>
              <div className="line">
                <span>نطاق بحث الكباتن الأقصى</span>
                <b>10 كم (منطقة حدائق الأهرام)</b>
              </div>
              <div className="line">
                <span>أقصى عدد محطات للطلب الواحد</span>
                <b>8 محطات</b>
              </div>
              <div className="line">
                <span>صلاحية العرض (طلبات التسوق)</span>
                <b>3 دقائق</b>
              </div>
              <div className="line">
                <span>صلاحية العرض (طلبات النقل)</span>
                <b>10 دقائق</b>
              </div>
              <div className="line">
                <span>فترة التجربة المجانية للكباتن</span>
                <b>30 يوماً</b>
              </div>
              <p className="mut" style={{ marginTop: '12px' }}>
                جميع الإعدادات مخزنة كبيانات في جدول <code>app.system_settings</code> وتعديلها فوري دون إعادة بناء التطبيق.
              </p>
            </div>

            <div className="card">
              <h3>سجل التدقيق الإداري (Audit Trail)</h3>
              <div className="tl">
                <div className="d">اليوم 10:02 · اعتماد توثيق: مصطفى فاروق (مستوى 2)</div>
                <div>اليوم 09:40 · تمديد اشتراك: إسلام جابر (+30 يوماً)</div>
                <div>أمس 22:11 · تفعيل إصدار التسعير 1 بحدائق الأهرام</div>
                <div>أمس 18:30 · مراجعة نزاع الطلب #1029 وإغلاقه بتحذير</div>
              </div>
              <p className="mut" style={{ marginTop: '14px' }}>
                🛡️ مسجل باسم المسؤول: <strong>{user.email}</strong>.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Backdrop for Drawers & Modals */}
      {(selectedOrder || selectedDispute || isAddDriverOpen || isAddOrderOpen) && (
        <div
          className="backdrop"
          onClick={() => {
            setSelectedOrder(null);
            setSelectedDispute(null);
            setIsAddDriverOpen(false);
            setIsAddOrderOpen(false);
          }}
        />
      )}

      {/* Add New Driver Modal */}
      {isAddDriverOpen && (
        <div className="drawer">
          <div className="head">
            <h2>تسجيل كابتن جديد</h2>
            <div className="sp" />
            <button className="chip" onClick={() => setIsAddDriverOpen(false)}>
              ✕ إغلاق
            </button>
          </div>

          <form onSubmit={handleCreateDriver} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label>اسم الكابتن الكامل</label>
              <input
                type="text"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                placeholder="مثال: محمد السيد"
                required
                autoFocus
              />
            </div>

            <div>
              <label>رقم هاتف الكابتن</label>
              <input
                type="tel"
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                required
              />
            </div>

            <div>
              <label>نوع المركبة</label>
              <select value={newDriverVehicle} onChange={(e) => setNewDriverVehicle(e.target.value)}>
                <option value="موتوسيكل">موتوسيكل</option>
                <option value="تروسيكل">تروسيكل</option>
                <option value="دراجة">دراجة</option>
                <option value="نص نقل">نص نقل</option>
                <option value="جامبو">جامبو</option>
              </select>
            </div>

            <div>
              <label>مستوى التوثيق المطلوب</label>
              <select
                value={newDriverLevel}
                onChange={(e) => setNewDriverLevel(Number(e.target.value) || 1)}
              >
                <option value={1}>مستوى 1 (أساسي: رخصة + بطاقة)</option>
                <option value={2}>مستوى 2 (فيش وتشبيه جنائي)</option>
                <option value={3}>مستوى 3 (سمعة وأولوية)</option>
              </select>
            </div>

            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
              تسجيل الكابتن فوراً
            </button>
          </form>
        </div>
      )}

      {/* Add New Order Modal */}
      {isAddOrderOpen && (
        <div className="drawer">
          <div className="head">
            <h2>تسجيل طلب جديد</h2>
            <div className="sp" />
            <button className="chip" onClick={() => setIsAddOrderOpen(false)}>
              ✕ إغلاق
            </button>
          </div>

          <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label>اسم العميل</label>
              <input
                type="text"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="مثال: عمر طارق"
                required
                autoFocus
              />
            </div>

            <div>
              <label>الكابتن المسند إليه (اختياري)</label>
              <input
                type="text"
                value={newDriverAssigned}
                onChange={(e) => setNewDriverAssigned(e.target.value)}
                placeholder="— للطلبات المنشورة بدون إسناد"
              />
            </div>

            <div>
              <label>نوع الخدمة</label>
              <select value={newOrderType} onChange={(e) => setNewOrderType(e.target.value)}>
                <option value="تسوق">تسوق</option>
                <option value="توصيل مع تصليح">توصيل مع تصليح</option>
                <option value="نقل أثاث ومقتنيات">نقل أثاث ومقتنيات</option>
                <option value="استلام أمانات">استلام أمانات</option>
              </select>
            </div>

            <div>
              <label>شريحة القيمة التقديرية</label>
              <select value={newOrderTier} onChange={(e) => setNewOrderTier(e.target.value)}>
                <option value="<200">أقل من 200 ج</option>
                <option value="200–500">200 – 500 ج</option>
                <option value="500–1000">500 – 1000 ج</option>
                <option value="1000–5000">1000 – 5000 ج</option>
                <option value=">5000">أكثر من 5000 ج</option>
              </select>
            </div>

            <div>
              <label>الأجرة التقديرية المقترحة (ج)</label>
              <input
                type="number"
                value={newOrderFare}
                onChange={(e) => setNewOrderFare(Number(e.target.value) || 0)}
              />
            </div>

            <div>
              <label>محطات الطلب (مفصولة بفواصل)</label>
              <input
                type="text"
                value={newOrderStops}
                onChange={(e) => setNewOrderStops(e.target.value)}
                placeholder="محل 1, صيدلية, بيت العميل"
              />
            </div>

            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
              نشر الطلب في اللوحة
            </button>
          </form>
        </div>
      )}

      {/* Order Details Drawer */}
      {selectedOrder && (
        <div className="drawer">
          <div className="head">
            <h2>الطلب {selectedOrder.id}</h2>
            <div className="sp" />
            <button className="chip" onClick={() => setSelectedOrder(null)}>
              ✕ إغلاق
            </button>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <span className={`chip ${ORDER_STATE_META[selectedOrder.state].chipClass}`}>
              {ORDER_STATE_META[selectedOrder.state].label}
            </span>{' '}
            <span>{selectedOrder.taskType}</span>
          </div>

          <div className="line">
            <span>العميل</span>
            <b>{selectedOrder.customerName}</b>
          </div>
          <div className="line">
            <span>الكابتن</span>
            <b>{selectedOrder.driverName}</b>
          </div>
          <div className="line">
            <span>فئة القيمة</span>
            <b>{selectedOrder.tier}</b>
          </div>

          <h3 style={{ marginTop: '16px' }}>محطات الطلب ({selectedOrder.stops.length})</h3>
          <div className="tl">
            {selectedOrder.stops.map((stop, i) => (
              <div key={i} className="d">
                {i + 1}. {stop}
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '16px' }}>تفاصيل احتساب الأجرة</h3>
          {selectedOrder.invoices.length > 0 ? (
            <div>
              <div className="line">
                <span>الزيارات المحسوبة ({selectedOrder.visits})</span>
                <b>{selectedOrder.visits * pricing.stopPrice} ج</b>
              </div>
              <div className="line">
                <span>ساعات الانتظار ({selectedOrder.waitingHours} س)</span>
                <b>{selectedOrder.waitingHours * pricing.waitingHourPrice} ج</b>
              </div>
              <div className="line">
                <span>
                  نسبة الفواتير ({selectedOrder.invoices.reduce((a, b) => a + b, 0)} ج)
                </span>
                <b>
                  {Math.round(
                    (selectedOrder.invoices.reduce((a, b) => a + b, 0) * pricing.invoicePercentage) / 100
                  )}{' '}
                  ج
                </b>
              </div>
              <div className="line" style={{ borderTop: '2px solid var(--line)', marginTop: '8px' }}>
                <b>الإجمالي المستحق</b>
                <b style={{ color: 'var(--color-accent, #f2a20c)', fontSize: '18px' }}>
                  {calculateFare(
                    selectedOrder.visits,
                    selectedOrder.waitingHours,
                    selectedOrder.invoices.reduce((a, b) => a + b, 0),
                    pricing
                  )}{' '}
                  ج
                </b>
              </div>
            </div>
          ) : (
            <div className="line">
              <span>الحد الأدنى المجمد / المقترح</span>
              <b>{selectedOrder.fare} ج</b>
            </div>
          )}
        </div>
      )}

      {/* Dispute Details Drawer */}
      {selectedDispute && (
        <div className="drawer">
          <div className="head">
            <h2>النزاع {selectedDispute.id}</h2>
            <div className="sp" />
            <button className="chip" onClick={() => setSelectedDispute(null)}>
              ✕ إغلاق
            </button>
          </div>

          <p style={{ marginBottom: '12px' }}>
            السبب: <strong>{selectedDispute.reason}</strong> · متعلق بالطلب <strong>{selectedDispute.orderId}</strong>
          </p>

          <h3>الخط الزمني للأحداث</h3>
          <div className="tl">
            {selectedDispute.timeline.map((ev, i) => (
              <div key={i} className="d">
                • {ev}
              </div>
            ))}
          </div>

          {selectedDispute.status === 'open' && (
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn ok"
                onClick={() => handleResolveDispute(selectedDispute.id)}
              >
                أغلق لصالح العميل
              </button>
              <button
                className="btn alt"
                onClick={() => showToast('تم إرسال إشعار للكابتن لرفع صورة الفاتورة المعتمدة')}
              >
                اطلب إثباتاً إضافياً
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && <div className="toast">{toastMessage}</div>}
    </div>
  );
};
