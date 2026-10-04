import { describe, it, expect } from 'vitest';
import { getDriverUiError, DRIVER_ERROR_TAXONOMY } from '../../src/services/errors/errorTaxonomy.js';
import { ErrorCode } from '@wasel/shared';

describe('Driver Error Taxonomy & Recovery Actions Tests', () => {
  it('maps ORDER_ALREADY_AGREED to Arabic notice and go_waiting recovery action', () => {
    const error = { code: ErrorCode.ORDER_ALREADY_AGREED, message: 'Already agreed' };
    const uiError = getDriverUiError(error);

    expect(uiError.arabicMessage).toBe('تم قبول هذا المشوار مسبقاً من كابتن آخر في سباق التنافس.');
    expect(uiError.recoveryActionLabel).toBe('العودة لانتظار الطلبات');
    expect(uiError.actionType).toBe('go_waiting');
  });

  it('maps SUBSCRIPTION_REQUIRED to Arabic notice and subscribe recovery action', () => {
    const error = { code: ErrorCode.SUBSCRIPTION_REQUIRED, message: 'Subscription inactive' };
    const uiError = getDriverUiError(error);

    expect(uiError.arabicMessage).toContain('يتطلب استقبال وقبول المشاوير وجود اشتراك نشط');
    expect(uiError.recoveryActionLabel).toBe('الاشتراك الآن');
    expect(uiError.actionType).toBe('subscribe');
  });

  it('maps VERIFICATION_LEVEL_TOO_LOW to Arabic notice and upgrade_verification recovery action', () => {
    const error = { code: ErrorCode.VERIFICATION_LEVEL_TOO_LOW, message: 'Low verification level' };
    const uiError = getDriverUiError(error);

    expect(uiError.arabicMessage).toContain('مستوى توثيق حسابك الحالي لا يسمح');
    expect(uiError.recoveryActionLabel).toBe('ترقية التوثيق');
    expect(uiError.actionType).toBe('upgrade_verification');
  });

  it('maps AGREEMENT_IMMUTABLE to Arabic notice and view_amendment recovery action', () => {
    const error = { code: ErrorCode.AGREEMENT_IMMUTABLE, message: 'Agreement immutable' };
    const uiError = getDriverUiError(error);

    expect(uiError.arabicMessage).toContain('بنود الاتفاق الحالي مغلقة نهائياً ومحمية من التعديل المباشر');
    expect(uiError.recoveryActionLabel).toBe('مراجعة الملحق');
    expect(uiError.actionType).toBe('view_amendment');
  });

  it('handles nested backend error response structure ({ error: { code, message } })', () => {
    const backendResponse = {
      error: {
        code: ErrorCode.ORDER_ALREADY_AGREED,
        message: 'Order already assigned to another driver',
      },
    };
    const uiError = getDriverUiError(backendResponse);

    expect(uiError.arabicMessage).toBe('تم قبول هذا المشوار مسبقاً من كابتن آخر في سباق التنافس.');
    expect(uiError.actionType).toBe('go_waiting');
  });

  it('handles 401 Unauthorized by directing user to login screen', () => {
    const error401 = { statusCode: 401, message: 'Unauthorized session' };
    const uiError = getDriverUiError(error401);

    expect(uiError.arabicMessage).toContain('انتهت صلاحية تسجيل الدخول');
    expect(uiError.recoveryActionLabel).toBe('تسجيل الدخول');
    expect(uiError.actionType).toBe('login');
  });

  it('handles 5xx Server Error by providing technical notice and retry action', () => {
    const error500 = { statusCode: 500, message: 'Internal server fault' };
    const uiError = getDriverUiError(error500);

    expect(uiError.arabicMessage).toContain('حدث خطأ تقني في الخادم');
    expect(uiError.recoveryActionLabel).toBe('إعادة المحاولة');
    expect(uiError.actionType).toBe('retry');
  });

  it('handles network disconnection by presenting offline queue notice', () => {
    const networkError = { message: 'Failed to fetch network resource' };
    const uiError = getDriverUiError(networkError);

    expect(uiError.arabicMessage).toContain('غير متصل بالإنترنت حالياً');
    expect(uiError.recoveryActionLabel).toBe('حسناً، فهمت');
    expect(uiError.actionType).toBe('dismiss');
  });

  it('provides safe fallback for unknown errors with a clear retry action', () => {
    const unknownError = { message: 'Something completely unexpected' };
    const uiError = getDriverUiError(unknownError);

    expect(uiError.arabicMessage).toContain('حدث خطأ غير متوقع');
    expect(uiError.recoveryActionLabel).toBe('إعادة المحاولة');
    expect(uiError.actionType).toBe('retry');
  });
});

