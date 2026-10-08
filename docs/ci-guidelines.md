# 🛡️ معايير الفحص الآلي وجودة الكود للوكلاء والمطورين
## CI Quality, Lint & Type-Safety Guidelines for Wasel

> **تنبيه هام لكافة المطورين ومساعدي الذكاء الاصطناعي (AI Agents):**  
> هذا الدليل يوضح الأسباب الجذرية لفشل خط بناء GitHub Actions (`Lint, Typecheck, Test & Build`)، والحلول الإلزامية لتجنب تكرار المشكلة نهائياً.

---

### ⚠️ ما هي المشكلة؟ (Problem Analysis)
عند دفع التعديلات إلى المستودع (`git push`)، يفشل فحص الـ CI في خطوة:
```bash
Lint (including Boundary Rules & No New Any)
$ turbo run lint
Error: Unexpected any. Specify a different type @typescript-eslint/no-explicit-any
```

#### السبب الجذري (Root Cause):
1. مشروع واصل يطبق معياراً صارماً في [`packages/config/eslint.base.mjs`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/packages/config/eslint.base.mjs):
   ```javascript
   rules: {
     '@typescript-eslint/no-explicit-any': 'error',
   }
   ```
2. توجد قائمة استثناءات مؤقتة فقط للملفات التاريخية القديمة (`Legacy allowlist`) تخفض الخطأ إلى تحذير (`warn`).
3. **أي ملف جديد** أو مكون يتم إنشاؤه أو تعديله خارج القائمة التاريخية (مثل ملفات التبويبات الجديدة في `apps/admin-web/src/components/dashboard/tabs/` أو صفحات الملف الشخصي الجديدة) **يُمنع فيه استخدام كلمة `any` منعاً باتاً**.
4. **فخ كاش Turborepo محلياً:** عند تشغيل `pnpm lint` على جهاز التطوير، قد يقوم Turborepo باستخدام الكاش القديم (`cache hit`) ويعطي نتيجة نجاح خادعة، بينما في خوادم GitHub Actions يُنفّذ الفحص من الصفر ويفشل!

---

### 📜 القواعد الذهبية الإلزامية (The 5 Mandatory Rules)

#### 1️⃣ ممنوع استخدام `any` نهائياً (Strict Zero-Any Policy)
* ❌ **خطأ قاتل:**
  ```typescript
  const [data, setData] = useState<any>(null);
  onChange={(e: any) => setRole(e.target.value)}
  ```
* ✅ **الصحيح والمعتمد:**
  ```typescript
  const [data, setData] = useState<UserDto | null>(null);
  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value as 'customer' | 'driver')}
  ```

#### 2️⃣ معالجة أخطاء الكاتش (Catch Block Typing)
* ❌ **خطأ:**
  ```typescript
  try { ... } catch (err: any) { alert(err.message); }
  ```
* ✅ **الصحيح:**
  ```typescript
  try { ... } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
    alert(message);
  }
  ```

#### 3️⃣ تعريف أنواع الكائنات والردود (Explicit Interfaces)
بدلاً من استقبال كائن مجهول، قم بتعريف واجهة دقيقة له أو استيرادها من حزم المشروع:
* الحزم المشتركة: `@wasel/shared` و `@wasel/api-client`.
* مثال لبيانات الـ API:
  ```typescript
  interface HealthCheckResponse {
    status: string;
    services: Record<string, { status: string; latencyMs?: number }>;
  }
  ```

#### 4️⃣ منع المتغيرات غير المستخدمة (No Unused Variables)
تأكد من عدم ترك أي استيراد أو متغير غير مستخدم في الملف، أو ابدأ اسمه بشرطة سفلية `_` إذا كان مطلوباً في التوقيع:
```typescript
const [_unused, setValue] = useState(0);
```

#### 5️⃣ أمر التحقق الإلزامي قبل كل Commit و Push
قبل دفع أي تعديل إلى GitHub، يجب تشغيل هذا الأمر بدون كاش للتأكد من خلو المشروع تماماً من الأخطاء:
```powershell
pnpm exec turbo run lint --force && pnpm typecheck && pnpm --filter @wasel/admin-web test && pnpm --filter @wasel/customer-web test && pnpm --filter @wasel/driver-web test
```

---

### 📂 الملفات المعنية التي تم تصحيحها (Fixed Files):
1. [`apps/admin-web/src/components/dashboard/tabs/SimulatorTab.tsx`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/apps/admin-web/src/components/dashboard/tabs/SimulatorTab.tsx): استبدال `any` بنوع `React.ChangeEvent<HTMLSelectElement>`.
2. [`apps/admin-web/src/components/dashboard/tabs/SystemHealthTab.tsx`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/apps/admin-web/src/components/dashboard/tabs/SystemHealthTab.tsx): إضافة واجهات `HealthCheckResponse` و `ServiceHealthItem`.
3. [`apps/admin-web/src/components/dashboard/tabs/UsersTab.tsx`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/apps/admin-web/src/components/dashboard/tabs/UsersTab.tsx): تحديد أنواع أحداث الإدخال بدقة واستبدال `any`.
4. [`apps/customer-web/src/components/profile/CustomerProfileModal.tsx`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/apps/customer-web/src/components/profile/CustomerProfileModal.tsx): تصحيح أنواع الطلبات والأخطاء.
5. [`apps/driver-web/src/components/profile/DriverProfileModal.tsx`](file:///c:/Users/karee/OneDrive/Desktop/Ahmed%20Files/wasel/apps/driver-web/src/components/profile/DriverProfileModal.tsx): تصحيح أنواع المركبات والملف التعريفي.
