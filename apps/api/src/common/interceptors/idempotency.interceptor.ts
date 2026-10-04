import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, from, throwError } from 'rxjs';
import { tap, catchError, mergeMap } from 'rxjs/operators';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ErrorCode } from '@wasel/shared';
import { RedisService } from '../redis/redis.service.js';
import { IDEMPOTENT_KEY, IdempotentOptions } from '../decorators/idempotent.decorator.js';

interface StoredIdempotencyRecord {
  status: 'in_progress' | 'completed';
  requestHash: string;
  statusCode?: number;
  responseBody?: unknown;
  createdAt: string;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

  constructor(
    @Inject(RedisService) private readonly redisService: RedisService,
    @Inject(Reflector) private readonly reflector: Reflector = new Reflector(),
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const reflector = this.reflector || new Reflector();
    const metadata = reflector.getAllAndOverride<IdempotentOptions | undefined>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const rawKey = request.headers['idempotency-key'] || request.headers['x-idempotency-key'];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    const isIdempotentRoute = !!metadata;
    if (!isIdempotentRoute && !idempotencyKey) {
      return next.handle();
    }

    const isRequired =
      metadata?.required &&
      (process.env.NODE_ENV === 'production' ||
        process.env.APP_ENV === 'production' ||
        process.env.REQUIRE_IDEMPOTENCY === 'true' ||
        request.headers['x-enforce-idempotency'] === 'true');

    if (isRequired && !idempotencyKey) {
      throw new BadRequestException({
        errorCode: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: 'مفتاح عدم التكرار (Idempotency-Key) إلزامي لهذه العملية',
      });
    }

    if (!idempotencyKey) {
      return next.handle();
    }

    const user = (request as unknown as { user?: { id?: string; userId?: string } }).user;
    const userId = user?.id || user?.userId || 'anon';
    const method = request.method;
    const routeTemplate = (request.route && request.route.path) || request.path;
    const redisKey = `idem:${userId}:${method}:${routeTemplate}:${idempotencyKey}`;

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request.body || {}))
      .digest('hex');

    // Check existing record
    const existingStr = await this.redisService.get(redisKey);
    if (existingStr) {
      try {
        const record = JSON.parse(existingStr) as StoredIdempotencyRecord;
        if (record.status === 'in_progress') {
          throw new ConflictException({
            errorCode: ErrorCode.IDEMPOTENCY_CONFLICT,
            message: 'طلب مكرر قيد المعالجة حالياً، يرجى الانتظار',
          });
        }

        if (record.status === 'completed') {
          if (record.requestHash !== requestHash) {
            throw new UnprocessableEntityException({
              errorCode: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
              message: 'مفتاح عدم التكرار (Idempotency-Key) مستخدم مسبقاً مع حمولة طلب مختلفة',
            });
          }

          if (record.statusCode) {
            response.status(record.statusCode);
          }
          response.setHeader('X-Cache-Lookup', 'IDEMPOTENT_HIT');
          return of(record.responseBody);
        }
      } catch (err: unknown) {
        if (err instanceof ConflictException || err instanceof UnprocessableEntityException) {
          throw err;
        }
      }
    }

    // Acquire atomic in-progress lock with 120s TTL
    const inProgressRecord: StoredIdempotencyRecord = {
      status: 'in_progress',
      requestHash,
      createdAt: new Date().toISOString(),
    };

    const acquired = await this.redisService.setNx(
      redisKey,
      JSON.stringify(inProgressRecord),
      120,
    );

    if (!acquired) {
      const reCheck = await this.redisService.get(redisKey);
      if (reCheck) {
        const record = JSON.parse(reCheck) as StoredIdempotencyRecord;
        if (record.status === 'completed' && record.requestHash !== requestHash) {
          throw new UnprocessableEntityException({
            errorCode: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
            message: 'مفتاح عدم التكرار (Idempotency-Key) مستخدم مسبقاً مع حمولة طلب مختلفة',
          });
        }
      }
      throw new ConflictException({
        errorCode: ErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'طلب مكرر قيد المعالجة حالياً، يرجى الانتظار',
      });
    }

    return next.handle().pipe(
      tap((responseBody) => {
        const completedRecord: StoredIdempotencyRecord = {
          status: 'completed',
          requestHash,
          statusCode: response.statusCode || 200,
          responseBody,
          createdAt: new Date().toISOString(),
        };
        void this.redisService.set(
          redisKey,
          JSON.stringify(completedRecord),
          this.IDEMPOTENCY_TTL_SECONDS,
        );
      }),
      catchError((err: unknown) => {
        return from(this.redisService.del(redisKey)).pipe(
          mergeMap(() => throwError(() => err)),
        );
      }),
    );
  }
}
