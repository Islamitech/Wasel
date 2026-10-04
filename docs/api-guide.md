# دليل واجهة برمجة التطبيقات لمنصة واصل (Wasel API Guide)

دليل شامل وتفصيلي للمطورين وفرق الواجهات الأمامية (Customer PWA، Driver PWA، وAdmin Web) لكيفية استهلاك واجهة برمجة التطبيقات لمنصة **واصل** (Wasel Modular Monolith API).

---

## 1. المبادئ الأساسية والمعايير العامة (Core Principles)

- **المسار الأساسي (Base Path):** جميع مسارات واجهة التطبيقات تبدأ بـ `/v1`.
- **اللغة والترجمة (Arabic-First i18n):** رسائل الأخطاء والاستجابات تصدر باللغة العربية أولاً ومصحوبة بمفتاح ترجمة قياسي `i18nKey` ورمز خطأ ثابت `errorCode` لتمكين تطبيقات العميل من توفير الترجمات المحلية.
- **التعامل المالي (No Wallets / Zero Financial Intermediary):** المنصة وسيط خالص ولا تعالج أي مدفوعات داخلية. جميع المعاملات المالية نقدية مباشرة بين الأطراف (كاش). تسجل المنصة الفواتير وإيصالات الاستلام فقط كقرائن إثبات.
- **تفويض العمليات الحسابية لقاعدة البيانات (Database-Driven Business Logic):** كافة قواعد التسعير وحساب عدد الزيارات واحتساب الأجور وحراس انتقال الحالات تتم عبر دوال ومحفزات PostgreSQL (`app.calculate_min_fare`, `app.calculate_final_fare`, `app.count_billable_visits`, `app.guard_status_transition`).
- **حماية تكرار العمليات (Idempotency-Key):** تقبل كافة طلبات `POST` المغيرة للحالة ترويسة `Idempotency-Key: <UUID>` لضمان عدم تكرار الخصم أو إنشاء اتفاقات مكررة عند انقطاع الشبكة.

---

## 2. نسق الاستجابة والأخطاء القياسي (Standard Envelope & Error Format)

تلتزم جميع استجابات الأخطاء بالنسق التالي:

```json
{
  "statusCode": 409,
  "errorCode": "ILLEGAL_TRANSITION",
  "message": "انتقال غير قانوني في حالة الطلب",
  "i18nKey": "errors.order.illegal_transition",
  "details": {
    "currentState": "draft",
    "targetState": "agreed"
  },
  "timestamp": "2026-10-04T03:30:00.000Z",
  "path": "/v1/orders/7b63f58a-360e-4581-9b63-95b6c2cfcf5b/accept"
}
```

### خريطة رموز الأخطاء الثابتة (Stable Error Codes)

| رمز الخطأ `errorCode` | رمز HTTP | الوصف العربي |
| :--- | :--- | :--- |
| `ILLEGAL_TRANSITION` | 409 Conflict | محاولة نقل الكيان إلى حالة غير مسموح بها في مصفوفة الحالات |
| `ORDER_NOT_PUBLISHABLE` | 400 Bad Request | الطلب ينقصه محطات أو تسعيرة معتمدة قبل النشر |
| `SUBSCRIPTION_REQUIRED` | 403 Forbidden | الكابتن لا يملك اشتراكاً نشطاً لتلقي أو قبول الطلبات |
| `VERIFICATION_LEVEL_TOO_LOW` | 403 Forbidden | مستوى توثيق الكابتن لا يسمح بقبول هذه الفئة السعرية |
| `MAX_STOPS_EXCEEDED` | 400 Bad Request | تجاوز الحد الأقصى للمحطات في الطلب (الافتراضي 8 محطات) |
| `INVALID_WAIT_MODE` | 400 Bad Request | محاولة بدء عداد الانتظار على طلب مضبوط بوضع الإشعار `notify` |
| `ORDER_ALREADY_AGREED` | 409 Conflict | تم قبول الطلب مسبقاً من كابتن آخر في سباق التنافس |
| `AGREEMENT_IMMUTABLE` | 409 Conflict | بنود الاتفاق مغلقة نهائياً ولا يمكن تعديلها إلا عبر ملحق معتمد |
| `VALIDATION_ERROR` | 400 Bad Request | فشل التحقق من صحة المدخلات عبر Zod مع تفاصيل الحقول |
| `FORBIDDEN` | 403 Forbidden | محاولة الوصول إلى مورد يتبع لمستخدم آخر |

---

## 3. حماية الخصوصية ومصفوفة الصلاحيات (Privacy & Ownership)

### سياسة حجب أرقام الهواتف (Phone Masking Policy)
- قبل إبرام الاتفاق (`Agreement`): تظهر أرقام هواتف العملاء للكباتن محجوبة جزئياً بصيغة `+20 10 **** 5678` في قوائم الطلبات القريبة وكروت المعاينة.
- بعد قبول العرض وتكوين الاتفاق: يُكشف رقم هاتف العميل للكابتن الفائز فقط لتمكين التواصل المباشر.

### مصفوفة الصلاحيات (Access Matrix)
- **العميل (Customer):** يملك صلاحية إنشاء مسودات الطلبات، تعديلها، طلب عروض الأسعار، نشرها، قبول/رفض العروض، اعتماد الملاحق، والاعتراض على الفواتير. لا يمكن لعميل الاطلاع على طلبات عميل آخر (403 Forbidden).
- **الكابتن (Driver):** يملك صلاحية استعراض الطلبات القريبة (المطابقة لنوع مركبته ومستوى توثيقه)، تقديم عروض الأسعار، قبول طلبات الشراء، تسجيل الوصول للمحطات، تشغيل عداد الانتظار، رفع الفواتير، واقتراح الملاحق.
- **الإدارة والدعم (Admin & Support):** استعراض شامل للبيانات، إدارة جداول التسعير المرجعية مع التدوين في سجل التدقيق (`audit_logs`)، مراجعة واعتماد طلبات توثيق الكباتن، وحل النزاعات.

---

## 4. دورة حياة الطلب خطوة بخطوة (End-to-End Order Lifecycle)

```mermaid
flowchart TD
    D["مسودة (draft)"] -->|POST /orders/:id/publish| P["منشور (published)"]
    P -->|POST /orders/:id/accept (شراء)| A["اتفاق نشط (active agreement)"]
    P -->|POST /orders/:id/offers + accept| A
    A -->|POST /agreements/:id/stops/:stopId/arrive| EX["قيد التنفيذ (in_progress)"]
    EX -->|POST /stops/:stopId/invoice| INV["إصدار فاتورة متجر"]
    INV -->|POST /invoices/:id/payment-recorded| REC["إيصال سداد نقدي"]
    REC -->|POST /agreements/:id/complete| C["مكتمل (completed)"]
```

### الخطوة 1: إنشاء مسودة الطلب
```http
POST /v1/orders
Authorization: Bearer <customer_token>
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
Content-Type: application/json

{
  "regionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "valueTierId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "loadSizeId": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "waitMode": "notify",
  "customerLocation": {
    "latitude": 29.9750,
    "longitude": 31.1150
  },
  "stops": [
    {
      "actionId": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
      "location": { "latitude": 29.9800, "longitude": 31.1200 },
      "description": "شراء بقالة من سوبرماركت الفرجاني",
      "expectedDurationMinutes": 15,
      "invoiceRequired": true
    }
  ]
}
```

### الخطوة 2: طلب تسعيرة تقريبية (SQL Quote)
يستدعي نقطة النهاية الدالة المخزنة في قاعدة البيانات لحساب الحد الأدنى بدقة:
```http
POST /v1/orders/:id/quote
Authorization: Bearer <customer_token>
```
**الرد:**
```json
{
  "orderId": "7b63f58a-360e-4581-9b63-95b6c2cfcf5b",
  "minFareMinor": 2600,
  "billableVisits": 1,
  "expectedWaitHours": 0,
  "suggestedVehicleClasses": ["motorcycle", "tricycle"],
  "breakdown": {
    "visitsFeeMinor": 1000,
    "waitFeeMinor": 0,
    "goodsCommissionMinor": 1600,
    "totalFareMinor": 2600,
    "currency": "EGP",
    "formattedFareEgp": "26 ج.م"
  }
}
```

### الخطوة 3: نشر الطلب للكباتن
```http
POST /v1/orders/:id/publish
Authorization: Bearer <customer_token>
Idempotency-Key: <UUID>
```

### الخطوة 4: قبول الطلب من الكابتن وإبرام الاتفاق
```http
POST /v1/orders/:id/accept
Authorization: Bearer <driver_token>
Idempotency-Key: <UUID>
```

### الخطوة 5: تسجيل الوصول ورفع الفواتير
```http
POST /v1/agreements/:id/stops/:stopId/arrive
Authorization: Bearer <driver_token>
Content-Type: application/json

{
  "location": { "latitude": 29.9800, "longitude": 31.1200 }
}
```

إصدار الفاتورة:
```http
POST /v1/stops/:stopId/invoice
Authorization: Bearer <driver_token>
Content-Type: application/json

{
  "invoiceNumber": "INV-1092",
  "amountMinor": 16000,
  "photoKey": "orders/invoices/inv-1092.jpg",
  "customerNote": "مشتريات بقالة"
}
```

تسجيل إيصال السداد من العميل:
```http
POST /v1/invoices/:id/payment-recorded
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "collectedAmountMinor": 16000,
  "receiptType": "cash",
  "notes": "تم السداد نقداً للكابتن في المتجر"
}
```

### الخطوة 6: إنهاء الرحلة وحساب الأجرة النهائية
```http
POST /v1/agreements/:id/complete
Authorization: Bearer <driver_token>
```
تحسب قاعدة البيانات الأجرة النهائية فورياً:
$\text{Fare} = (\text{Visits} \times 10) + (\text{Wait Hours} \times 35) + (10\% \times \text{Invoices Total})$

---

## 5. البث اللحظي عبر SSE (Realtime Server-Sent Events)

توفر المنصة قناة بث أحادية خفيفة الوزن تعتمد على **Server-Sent Events** تدعم إعادة الاتصال التلقائي وتتبع آخر حدث مستلم عبر ترويسة `Last-Event-ID`.

### الاتصال بالقناة
```http
GET /v1/stream?token=<jwt_access_token>
Accept: text/event-stream
Last-Event-ID: evt-1791074000-abcd
```

### نسق الأحداث الواردة
```
id: evt-1791074123-efgh
event: order.published
data: {"orderId":"7b63f58a","minFareMinor":2600,"regionId":"3fa85f64"}

:keepalive 1791074138
```

---

## 6. استهلاك العميل المكتوب بلغة TypeScript (@wasel/api-client)

توفر حزمة `@wasel/api-client` عميلاً كامل الكتابة (Fully Typed SDK):

```typescript
import { createApiClient, UserRole } from '@wasel/api-client';

const client = createApiClient({
  baseUrl: 'https://api.wasel.local',
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  onTokenRefreshed: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  onAuthFailed: () => {
    window.location.href = '/login';
  },
});

// مثال: إنشاء طلب جديد مع Idempotency-Key
const order = await client.orders.create({
  regionId: '...',
  valueTierId: '...',
  loadSizeId: '...',
  waitMode: 'wait',
  customerLocation: { latitude: 29.975, longitude: 31.115 },
  stops: [/* ... */],
}, crypto.randomUUID());

// مثال: الاشتراك في البث المباشر مع استئناف فوري
const sub = client.subscribeRealtime({
  onEvent: (event, payload, id) => {
    console.log(`[Event: ${event}]`, payload);
  },
  onError: (err) => console.error('SSE Error:', err),
});
```
