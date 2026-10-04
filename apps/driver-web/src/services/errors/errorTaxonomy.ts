import { ErrorCode } from '@wasel/shared';

export interface DriverUiErrorDetails {
  arabicMessage: string;
  recoveryActionLabel: string;
  actionType:
    | 'retry'
    | 'refresh'
    | 'dismiss'
    | 'login'
    | 'go_waiting'
    | 'go_off'
    | 'subscribe'
    | 'upgrade_verification'
    | 'view_amendment';
}

export const DRIVER_ERROR_TAXONOMY: Record<string, DriverUiErrorDetails> = {
  [ErrorCode.ORDER_ALREADY_AGREED]: {
    arabicMessage: 'تم قبول هذا المشوار مسبقاً من كابتن آخر في سباق التنافس.',
    recoveryActionLabel: 'العودة لانتظار الطلبات',
    actionType: 'go_waiting',
  },
  [ErrorCode.SUBSCRIPTION_REQUIRED]: {
    arabicMessage: 'عذراً، يتطلب استقبال وقبول المشاوير وجود اشتراك نشط للكابتن.',
    recoveryActionLabel: 'الاشتراك الآن',
    actionType: 'subscribe',
  },
  [ErrorCode.VERIFICATION_LEVEL_TOO_LOW]: {
    arabicMessage: 'مستوى توثيق حسابك الحالي لا يسمح بقبول هذه الفئة المالية من الطلبات.',
    recoveryActionLabel: 'ترقية التوثيق',
    actionType: 'upgrade_verification',
  },
  [ErrorCode.ILLEGAL_TRANSITION]: {
    arabicMessage: 'تم تحديث حالة المشوار بالفعل من جانب العميل أو النظام.',
    recoveryActionLabel: 'تحديث الشاشة',
    actionType: 'refresh',
  },
  [ErrorCode.AGREEMENT_IMMUTABLE]: {
    arabicMessage: 'بنود الاتفاق الحالي مغلقة نهائياً ومحمية من التعديل المباشر.',
    recoveryActionLabel: 'مراجعة الملحق',
    actionType: 'view_amendment',
  },
  [ErrorCode.OFFER_EXPIRED]: {
    arabicMessage: 'انتهت المهلة المحددة لهذا العرض ولم يعد متاحاً.',
    recoveryActionLabel: 'استقبال طلبات أخرى',
    actionType: 'go_waiting',
  },
  [ErrorCode.OFFER_ROUND_LIMIT_REACHED]: {
    arabicMessage: 'تم استنفاد الحد الأقصى لجولات التفاوض على السعر لهذا الطلب.',
    recoveryActionLabel: 'العودة للبحث',
    actionType: 'go_waiting',
  },
  [ErrorCode.INVALID_WAIT_MODE]: {
    arabicMessage: 'وضع الانتظار غير مفعل لهذا الطلب بناءً على اختيار العميل.',
    recoveryActionLabel: 'متابعة المشوار',
    actionType: 'dismiss',
  },
  [ErrorCode.RATE_LIMITED]: {
    arabicMessage: 'تم إرسال عدد كبير من الطلبات في وقت قصير. يرجى الانتظار ثوانٍ معدودة.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    arabicMessage: 'البيانات المدخلة غير صحيحة، يرجى التأكد من الحقول ومحاولة الإرسال مجدداً.',
    recoveryActionLabel: 'تصحيح المدخلات',
    actionType: 'dismiss',
  },
  [ErrorCode.UNAUTHORIZED]: {
    arabicMessage: 'انتهت صلاحية تسجيل الدخول، يرجى تسجيل الدخول مجدداً لمتابعة الوردية.',
    recoveryActionLabel: 'تسجيل الدخول',
    actionType: 'login',
  },
  [ErrorCode.FORBIDDEN]: {
    arabicMessage: 'ليس لديك صلاحية لتنفيذ هذا الإجراء على هذا المشوار.',
    recoveryActionLabel: 'العودة للرئيسية',
    actionType: 'go_off',
  },
  [ErrorCode.NOT_FOUND]: {
    arabicMessage: 'الطلب أو الاتفاق المطلوب غير موجود أو تم إلغاؤه.',
    recoveryActionLabel: 'العودة للرئيسية',
    actionType: 'go_waiting',
  },
  [ErrorCode.IDEMPOTENCY_CONFLICT]: {
    arabicMessage: 'العملية قيد المعالجة حالياً على الخادم لحماية حسابك من التكرار.',
    recoveryActionLabel: 'تحديث الشاشة',
    actionType: 'refresh',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    arabicMessage: 'حدث خطأ تقني في الخادم، يرجى المحاولة بعد لحظات.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  },
};

export function getDriverUiError(err: any): DriverUiErrorDetails {
  const code =
    err?.errorCode ||
    err?.code ||
    err?.error?.code ||
    err?.error?.errorCode;

  if (code && DRIVER_ERROR_TAXONOMY[code]) {
    return DRIVER_ERROR_TAXONOMY[code];
  }

  if (typeof navigator !== 'undefined' && (!navigator.onLine || err?.message?.toLowerCase().includes('network'))) {
    return {
      arabicMessage: 'أنت غير متصل بالإنترنت حالياً. تم حفظ الإجراء في قائمة العمليات دون اتصال وسيعاد تنفيذه تلقائياً عند عودة الشبكة.',
      recoveryActionLabel: 'حسناً، فهمت',
      actionType: 'dismiss',
    };
  }

  return {
    arabicMessage: 'عذراً، حدث خطأ غير متوقع أثناء معالجة الطلب.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  };
}
