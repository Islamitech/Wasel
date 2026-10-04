import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    if (!req) return next.handle();

    const start = process.hrtime.bigint();
    const method = req.method || 'GET';
    const path = req.route?.path || req.baseUrl || req.url?.split('?')[0] || '/';

    return next.handle().pipe(
      tap({
        next: () => {
          const end = process.hrtime.bigint();
          const durationSeconds = Number(end - start) / 1e9;
          const statusCode = res?.statusCode || 200;
          this.metricsService.recordHttpRequest(method, path, statusCode, durationSeconds);
        },
        error: (err: unknown) => {
          const end = process.hrtime.bigint();
          const durationSeconds = Number(end - start) / 1e9;
          const errorObj = err as { status?: number; statusCode?: number } | null | undefined;
          const statusCode = errorObj?.status || errorObj?.statusCode || 500;
          this.metricsService.recordHttpRequest(method, path, statusCode, durationSeconds);
        },
      }),
    );
  }
}
