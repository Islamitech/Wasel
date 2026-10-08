import { ErrorCode } from '@wasel/shared';

export interface UiErrorDetails {
  arabicMessage: string;
  recoveryActionLabel: string;
  actionType: 'retry' | 'refresh' | 'edit_cart' | 'dismiss' | 'login' | 'new_order';
}

export const ERROR_TAXONOMY: Record<string, UiErrorDetails> = {
  [ErrorCode.ILLEGAL_TRANSITION]: {
    arabicMessage: 'تم تغيير حالة الطلب بالفعل. جاري تحديث الشاشة لتطابق أحدث حالة.',
    recoveryActionLabel: 'تحديث الشاشة',
    actionType: 'refresh',
  },
  [ErrorCode.ORDER_NOT_PUBLISHABLE]: {
    arabicMessage: 'الطلب غير مكتمل. يرجى التأكد من إضافة محطة واحدة على الأقل وتحديد شريحة القيمة.',
    recoveryActionLabel: 'مراجعة السلة',
    actionType: 'edit_cart',
  },
  [ErrorCode.MAX_STOPS_EXCEEDED]: {
    arabicMessage: 'عذراً، تجاوزت الحد الأقصى للمحطات في الطلب الواحد (8 محطات كحد أقصى).',
    recoveryActionLabel: 'حذف محطات زائدة',
    actionType: 'edit_cart',
  },
  [ErrorCode.ORDER_ALREADY_AGREED]: {
    arabicMessage: 'تم قبول هذا الطلب مسبقاً من كابتن آخر.',
    recoveryActionLabel: 'عرض حالة الطلب',
    actionType: 'refresh',
  },
  [ErrorCode.AGREEMENT_IMMUTABLE]: {
    arabicMessage: 'بنود الاتفاق الحالي مغلقة نهائياً. تم إنشاء ملحق مقترح لإقراره.',
    recoveryActionLabel: 'مراجعة الملحق',
    actionType: 'refresh',
  },
  [ErrorCode.OFFER_EXPIRED]: {
    arabicMessage: 'انتهت صلاحية هذا العرض ولم يعد متاحاً للقبول.',
    recoveryActionLabel: 'عرض العروض الحالية',
    actionType: 'refresh',
  },
  [ErrorCode.OFFER_ROUND_LIMIT_REACHED]: {
    arabicMessage: 'تم استنفاد جولات التفاوض القصوى لهذا الطلب.',
    recoveryActionLabel: 'قبول آخر عرض أو إلغاء',
    actionType: 'refresh',
  },
  [ErrorCode.INVALID_WAIT_MODE]: {
    arabicMessage: 'وضع الانتظار المختار غير متوافق مع نوع المحطة.',
    recoveryActionLabel: 'تعديل السلة',
    actionType: 'edit_cart',
  },
  [ErrorCode.SUBSCRIPTION_REQUIRED]: {
    arabicMessage: 'هذا الإجراء يتطلب اشتراكاً سارياً.',
    recoveryActionLabel: 'حسناً',
    actionType: 'dismiss',
  },
  [ErrorCode.VERIFICATION_LEVEL_TOO_LOW]: {
    arabicMessage: 'مستوى التوثيق الحالي لا يتيح تنفيذ هذه الفئة من المهام.',
    recoveryActionLabel: 'حسناً',
    actionType: 'dismiss',
  },
  [ErrorCode.RATE_LIMITED]: {
    arabicMessage: 'تم إرسال عدد كبير من الطلبات في وقت قصير. يرجى الانتظار ثوانٍ معدودة.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  },
  [ErrorCode.VALIDATION_ERROR]: {
    arabicMessage: 'البيانات المدخلة غير صحيحة، يرجى مراجعة الحقول.',
    recoveryActionLabel: 'تصحيح المدخلات',
    actionType: 'dismiss',
  },
  [ErrorCode.UNAUTHORIZED]: {
    arabicMessage: 'انتهت صلاحية تسجيل الدخول. يرجى إعادة تسجيل الدخول لمتابعة الطلب.',
    recoveryActionLabel: 'تسجيل الدخول',
    actionType: 'login',
  },
  [ErrorCode.FORBIDDEN]: {
    arabicMessage: 'ليس لديك صلاحية للوصول إلى هذا الطلب.',
    recoveryActionLabel: 'العودة للرئيسية',
    actionType: 'new_order',
  },
  [ErrorCode.NOT_FOUND]: {
    arabicMessage: 'الطلب أو المورد المطلوب غير موجود أو تم حذفه.',
    recoveryActionLabel: 'بدء طلب جديد',
    actionType: 'new_order',
  },
  [ErrorCode.IDEMPOTENCY_CONFLICT]: {
    arabicMessage: 'العملية قيد المعالجة بالفعل من الخادم لتجنب التكرار.',
    recoveryActionLabel: 'متابعة الطلب',
    actionType: 'refresh',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    arabicMessage: 'حدث خطأ في الخادم أثناء معالجة الطلب. يرجى المحاولة بعد لحظات.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  },
};

export function getUiError(err: any): UiErrorDetails {
  const code = err?.errorCode || err?.code;
  if (code && ERROR_TAXONOMY[code]) {
    return ERROR_TAXONOMY[code];
  }
  const msg = (err?.message || '').toLowerCase();
  if (
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('abort')
  ) {
    return {
      arabicMessage: 'تعذر الاتصال بخادم واصل. يرجى التحقق من اتصال الإنترنت أو تشغيل الخادم.',
      recoveryActionLabel: 'إعادة المحاولة',
      actionType: 'retry',
    };
  }
  return {
    arabicMessage: err?.message || 'عذراً، حدث خطأ غير متوقع أثناء معالجة الطلب.',
    recoveryActionLabel: 'إعادة المحاولة',
    actionType: 'retry',
  };
}
