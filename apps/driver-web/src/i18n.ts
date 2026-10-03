import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ar: {
    translation: {
      appName: 'واصل كابتن',
      welcome: 'مرحباً كابتن واصل',
      tagline: 'منصة السائقين لخدمات النقل والتوصيل بحدائق الأهرام',
      auth: {
        phoneTitle: 'تسجيل دخول الكابتن',
        phoneSubtitle: 'أدخل رقم هاتفك لتسجيل الدخول والبدء باستقبال الطلبات',
        phoneLabel: 'رقم الهاتف',
        phonePlaceholder: '01012345678',
        sendOtp: 'إرسال رمز الدخول',
        otpTitle: 'تأكيد الرمز',
        otpSubtitle: 'أدخل الرمز المكون من 6 أرقام المرسل إلى {{phone}}',
        otpLabel: 'رمز التحقق',
        verifyOtp: 'دخول للوردية',
        resendOtp: 'إعادة إرسال الرمز',
        resendIn: 'إعادة الإرسال بعد {{seconds}} ثانية',
        changePhone: 'تعديل رقم الهاتف',
        logout: 'تسجيل الخروج',
      },
      driver: {
        statusOnline: 'متصل ومستعد لتلقي الطلبات',
        statusOffline: 'غير متصل (استراحة)',
        toggleOnline: 'ابدأ استقبال الطلبات',
        toggleOffline: 'أخذ استراحة',
        vehicleType: 'فئة المركبة: تروسيكل / موتوسيكل',
        activeZone: 'النطاق الجغرافي: حدائق الأهرام بالكامل',
        subscriptionStatus: 'حالة الاشتراك: اشتراك نشط (حتى نهاية الشهر)',
      },
      ui: {
        offline: 'أنت غير متصل بالإنترنت حالياً.',
        updateAvailable: 'يتوفر تحديث جديد للتطبيق.',
        updateNow: 'تحديث الآن',
        close: 'إغلاق',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
