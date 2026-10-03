import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { ErrorCode } from '@wasel/shared';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  // In production, backed by Redis with a TTL (e.g. 24h)
  private readonly store = new Map<string, { response: any; status: number }>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    // Only apply idempotency to mutating POST requests with header
    if (request.method !== 'POST') {
      return next.handle();
    }

    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      return next.handle();
    }

    const cached = this.store.get(idempotencyKey);
    if (cached) {
      if (cached.status === 200 || cached.status === 201) {
        return of(cached.response);
      }
      throw new ConflictException({
        errorCode: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'طلب مكرر بنفس مفتاح عدم التكرار (Idempotency Key)',
      });
    }

    return next.handle().pipe(
      tap((data) => {
        this.store.set(idempotencyKey, { response: data, status: 200 });
      }),
    );
  }
}
