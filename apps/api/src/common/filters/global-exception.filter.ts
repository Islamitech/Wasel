import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '@wasel/shared';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request as any).id || (request.headers['x-request-id'] as string) || `req-${Date.now()}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'حدث خطأ داخلي في الخادم';
    let i18nKey = 'errors.common.internal_error';
    let details: any = undefined;

    const rawError = exception as any;

    // 1. Structured SQLSTATE & Constraint matching (prevent internal SQL leak)
    const dbCode = rawError?.code || rawError?.routine;
    const dbHint = rawError?.hint;
    const constraintName = rawError?.constraint || '';
    const dbMessage = rawError?.message || '';

    if (
      dbCode === '23514' ||
      dbMessage.includes('check constraint') ||
      dbMessage.includes('check_violation')
    ) {
      if (dbHint === 'ILLEGAL_TRANSITION' || dbMessage.includes('Illegal status transition')) {
        status = HttpStatus.CONFLICT;
        errorCode = ErrorCode.ILLEGAL_TRANSITION;
        i18nKey = 'errors.state_machine.illegal_transition';
        message = 'الانتقال بين هذه الحالات غير مسموح به في دورة حياة الطلب';
      } else if (
        constraintName.includes('immutable') ||
        dbMessage.includes('Agreement terms and snapshot are immutable')
      ) {
        status = HttpStatus.CONFLICT;
        errorCode = ErrorCode.AGREEMENT_IMMUTABLE;
        i18nKey = 'errors.agreements.immutable';
        message = 'بنود الاتفاقية والشروط مجمدة ولا يمكن تعديلها بعد التثبيت';
      } else if (
        constraintName.includes('max_stops') ||
        dbMessage.includes('max_stops') ||
        dbMessage.includes('Order cannot have more than')
      ) {
        status = HttpStatus.BAD_REQUEST;
        errorCode = ErrorCode.MAX_STOPS_EXCEEDED;
        i18nKey = 'errors.orders.max_stops_exceeded';
        message = 'تجاوزت الطلبية الحد الأقصى للمحطات المسموح بها';
        details = { constraint: 'max_tasks_per_order' };
      } else {
        status = HttpStatus.BAD_REQUEST;
        errorCode = ErrorCode.VALIDATION_ERROR;
        i18nKey = 'errors.validation.check_violation';
        message = 'قيمة الحقل غير مقبولة وتخالف شروط التحقق';
        details = { constraint: constraintName || 'check_constraint' };
      }
    } else if (
      dbCode === '23505' ||
      dbMessage.includes('unique constraint') ||
      dbMessage.includes('unique_violation')
    ) {
      status = HttpStatus.CONFLICT;
      if (
        constraintName.includes('agreements_active') ||
        dbMessage.includes('idx_agreements_active_per_order')
      ) {
        errorCode = ErrorCode.ORDER_ALREADY_AGREED;
        i18nKey = 'errors.agreements.already_agreed';
        message = 'تم قبول هذا الطلب وتأكيد الاتفاق مسبقاً مع كابتن آخر';
      } else if (constraintName.includes('uq_offers_order_driver')) {
        errorCode = ErrorCode.CONFLICT;
        i18nKey = 'errors.offers.already_submitted';
        message = 'لقد قمت بتقديم عرض سعر على هذا الطلب بالفعل';
      } else {
        errorCode = ErrorCode.CONFLICT;
        i18nKey = 'errors.common.conflict';
        message = 'السجل موجود مسبقاً ويتعارض مع البيانات الحالية';
      }
      details = { constraint: constraintName || undefined };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || obj.error || message;
        errorCode = obj.errorCode || this.mapStatusToErrorCode(status);
        i18nKey = obj.i18nKey || this.mapStatusToI18nKey(status);
        details = obj.details || obj.errors || undefined;
      }
    } else if (exception instanceof Error) {
      // Unhandled / Internal Server Error - Sanitized generic response, full log on server
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'حدث خطأ داخلي في الخادم';
      errorCode = ErrorCode.INTERNAL_ERROR;
      i18nKey = 'errors.common.internal_error';
      details = undefined;
      this.logger.error(
        `Unhandled Internal Exception [${requestId}]: ${exception.message}`,
        exception.stack,
      );
    }

    const payload = {
      statusCode: status,
      errorCode,
      message,
      i18nKey,
      details,
      timestamp: new Date().toISOString(),
      path: request.url?.split('?')[0] || request.url,
      requestId,
    };

    response.status(status).json(payload);
  }

  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private mapStatusToI18nKey(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'errors.common.bad_request';
      case HttpStatus.UNAUTHORIZED:
        return 'errors.auth.unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'errors.auth.forbidden';
      case HttpStatus.NOT_FOUND:
        return 'errors.common.not_found';
      case HttpStatus.CONFLICT:
        return 'errors.common.conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'errors.rate_limit.exceeded';
      default:
        return 'errors.common.internal_error';
    }
  }
}
