import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ar: {
    translation: {
      appName: 'واصل',
      welcome: 'مرحباً بك في واصل',
      tagline: 'منصة المشاوير والتوصيل في حدائق الأهرام',
      auth: {
        phoneTitle: 'تسجيل الدخول / إنشاء حساب',
        phoneSubtitle: 'أدخل رقم هاتفك لتلقي رمز التحقق السريع',
        phoneLabel: 'رقم الهاتف',
        phonePlaceholder: '01012345678',
        sendOtp: 'إرسال رمز التحقق',
        otpTitle: 'تأكيد رمز التحقق',
        otpSubtitle: 'أدخل الرمز المكون من 6 أرقام المرسل إلى {{phone}}',
        otpLabel: 'رمز التحقق',
        verifyOtp: 'تأكيد ودخول',
        resendOtp: 'إعادة إرسال الرمز',
        resendIn: 'إعادة الإرسال بعد {{seconds}} ثانية',
        changePhone: 'تعديل رقم الهاتف',
        logout: 'تسجيل الخروج',
      },
      home: {
        greeting: 'أهلاً، {{name}}',
        customerBadge: 'عميل',
        activeRegion: 'المنطقة: حدائق الأهرام (الجيزة)',
        availableServices: 'الخدمات المتاحة',
        errands: 'شراء وتوصيل طلبات',
        parcel: 'توصيل طرد',
        moving: 'نقل عفش وأغراض',
        readyNotice: 'هذا الهيكل جاهز لاستقبال شاشات الطلبات والخريطة التفاعلية.',
      },
      ui: {
        offline: 'أنت غير متصل بالإنترنت حالياً. تعمل المنصة في الوضع غير المتصل.',
        updateAvailable: 'يتوفر تحديث جديد للتطبيق.',
        updateNow: 'تحديث الآن',
        close: 'إغلاق',
        errorTitle: 'عذراً، حدث خطأ غير متوقع',
        retry: 'إعادة المحاولة',
      },
    },
  },
  en: {
    translation: {
      appName: 'Wasel',
      welcome: 'Welcome to Wasel',
      tagline: 'Errands and delivery marketplace in Hadayek al-Ahram',
      auth: {
        phoneTitle: 'Sign In / Register',
        phoneSubtitle: 'Enter your phone number to receive a verification OTP',
        phoneLabel: 'Phone Number',
        phonePlaceholder: '01012345678',
        sendOtp: 'Send Code',
        otpTitle: 'Verify Code',
        otpSubtitle: 'Enter the 6-digit code sent to {{phone}}',
        otpLabel: 'Verification Code',
        verifyOtp: 'Verify & Enter',
        resendOtp: 'Resend Code',
        resendIn: 'Resend in {{seconds}}s',
        changePhone: 'Change Phone',
        logout: 'Sign Out',
      },
      home: {
        greeting: 'Hello, {{name}}',
        customerBadge: 'Customer',
        activeRegion: 'Region: Hadayek al-Ahram (Giza)',
        availableServices: 'Available Services',
        errands: 'Shopping & Errands',
        parcel: 'Parcel Delivery',
        moving: 'Moving & Furniture',
        readyNotice: 'Shell ready for interactive map and order cart workflows.',
      },
      ui: {
        offline: 'You are currently offline. Running in offline shell mode.',
        updateAvailable: 'A new update is available.',
        updateNow: 'Update Now',
        close: 'Close',
        errorTitle: 'An unexpected error occurred',
        retry: 'Retry',
      },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
