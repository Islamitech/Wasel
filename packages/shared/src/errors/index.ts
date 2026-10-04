import { z } from 'zod';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  OTP_INVALID = 'OTP_INVALID',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_COOLDOWN = 'OTP_COOLDOWN',
  OTP_MAX_ATTEMPTS = 'OTP_MAX_ATTEMPTS',
  CONFLICT = 'CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Domain-Specific Errors
  ORDER_NOT_PUBLISHABLE = 'ORDER_NOT_PUBLISHABLE',
  ILLEGAL_TRANSITION = 'ILLEGAL_TRANSITION',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  VERIFICATION_LEVEL_TOO_LOW = 'VERIFICATION_LEVEL_TOO_LOW',
  MAX_STOPS_EXCEEDED = 'MAX_STOPS_EXCEEDED',
  INVALID_WAIT_MODE = 'INVALID_WAIT_MODE',
  OWNERSHIP_VIOLATION = 'OWNERSHIP_VIOLATION',
  ORDER_ALREADY_AGREED = 'ORDER_ALREADY_AGREED',
  AGREEMENT_IMMUTABLE = 'AGREEMENT_IMMUTABLE',
  OFFER_EXPIRED = 'OFFER_EXPIRED',
  OFFER_ROUND_LIMIT_REACHED = 'OFFER_ROUND_LIMIT_REACHED',
  LOCATION_OUTSIDE_REGION = 'LOCATION_OUTSIDE_REGION',
  IDEMPOTENCY_PAYLOAD_MISMATCH = 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  IDEMPOTENCY_KEY_REQUIRED = 'IDEMPOTENCY_KEY_REQUIRED',
  DRIVER_NOT_ELIGIBLE = 'DRIVER_NOT_ELIGIBLE',
  SELF_ASSIGNMENT_FORBIDDEN = 'SELF_ASSIGNMENT_FORBIDDEN',
  ORDER_EXPIRED = 'ORDER_EXPIRED',
  ORDER_MEDIA_LIMIT_EXCEEDED = 'ORDER_MEDIA_LIMIT_EXCEEDED',
  INVALID_MEDIA_TYPE = 'INVALID_MEDIA_TYPE',
  DOCUMENT_NOT_FOUND_IN_STORAGE = 'DOCUMENT_NOT_FOUND_IN_STORAGE',
  MESSAGING_EXPIRED = 'MESSAGING_EXPIRED',
  RATING_ALREADY_SUBMITTED = 'RATING_ALREADY_SUBMITTED',
  RATING_NOT_ALLOWED = 'RATING_NOT_ALLOWED',
}

export const ApiErrorEnvelopeSchema = z.object({
  statusCode: z.number(),
  errorCode: z.nativeEnum(ErrorCode),
  message: z.string(),
  i18nKey: z.string().optional(),
  details: z.any().optional(),
  timestamp: z.string(),
  path: z.string(),
  requestId: z.string().optional(),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export function formatAuthError(error: unknown): string {
  if (!error) return 'حدث خطأ غير متوقع';

  const errObj = error as { errorCode?: string; code?: string; details?: { remainingAttempts?: number; cooldownSeconds?: number; retryAfter?: number }; message?: string };
  const errorCode = errObj?.errorCode || errObj?.code;
  const details = errObj?.details;


  switch (errorCode) {
    case ErrorCode.OTP_INVALID: {
      const remaining = details?.remainingAttempts;
      if (typeof remaining === 'number') {
        return `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}`;
      }
      return 'رمز التحقق غير صحيح، يرجى التأكد وإعادة المحاولة';
    }
    case ErrorCode.OTP_EXPIRED:
      return 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد';
    case ErrorCode.OTP_COOLDOWN: {
      const seconds = details?.cooldownSeconds || details?.retryAfter;
      if (typeof seconds === 'number') {
        return `يرجى الانتظار ${seconds} ثانية قبل إعادة طلب الرمز`;
      }
      return 'يرجى الانتظار قبل إعادة إرسال الرمز';
    }
    case ErrorCode.OTP_MAX_ATTEMPTS:
      return 'تم تجاوز الحد الأقصى للمحاولات. يرجى طلب رمز تحقق جديد';
    case ErrorCode.RATE_LIMITED:
      return 'تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار والمحاولة لاحقاً';
    case ErrorCode.UNAUTHORIZED:
      return 'بيانات تسجيل الدخول غير صحيحة';
    case ErrorCode.FORBIDDEN:
      return 'ليس لديك صلاحية للوصول إلى هذا المورد';
    case ErrorCode.CONFLICT:
    case ErrorCode.IDEMPOTENCY_CONFLICT:
      return 'حدث تعارض في العملية، يرجى المحاولة مجدداً';
    default: {
      const msg = errObj?.message;

      if (typeof msg === 'string') {
        if (msg.includes('fetch') || msg.includes('Network') || msg.includes('Failed to fetch')) {
          return 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت';
        }
        return msg;
      }
      return 'حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة مرة أخرى';
    }
  }
}

