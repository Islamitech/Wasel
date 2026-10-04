import { Injectable, Inject, forwardRef } from '@nestjs/common';
import * as client from 'prom-client';
import { DatabaseService } from '../../database/database.service.js';
import { sql } from 'drizzle-orm';

@Injectable()
export class MetricsService {
  public readonly registry: client.Registry;

  // Prometheus Metrics
  public readonly httpRequestsTotal: client.Counter<'method' | 'route' | 'status_code'>;
  public readonly http5xxRate: client.Counter<'route'>;
  public readonly httpRequestDurationSeconds: client.Histogram<'method' | 'route' | 'status_code'>;
  public readonly outboxLagGauge: client.Gauge;
  public readonly otpDeliveryTotal: client.Counter<'status' | 'provider'>;
  public readonly dbPoolSaturationGauge: client.Gauge;
  public readonly dbPoolActiveGauge: client.Gauge;
  public readonly dbPoolMaxGauge: client.Gauge;
  public readonly matchingDurationSeconds: client.Histogram<'operation'>;

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    private readonly dbService: DatabaseService,
  ) {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry, prefix: 'wasel_' });

    this.httpRequestsTotal = new client.Counter({
      name: 'wasel_http_requests_total',
      help: 'Total number of HTTP requests processed by Wasel API',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.http5xxRate = new client.Counter({
      name: 'wasel_http_5xx_total',
      help: 'Total number of 5xx HTTP server errors',
      labelNames: ['route'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'wasel_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.outboxLagGauge = new client.Gauge({
      name: 'wasel_outbox_lag_count',
      help: 'Current count of pending or locked outbox events waiting for dispatch',
      registers: [this.registry],
    });

    this.otpDeliveryTotal = new client.Counter({
      name: 'wasel_otp_delivery_total',
      help: 'Count of OTP verification delivery attempts by status and provider',
      labelNames: ['status', 'provider'],
      registers: [this.registry],
    });

    this.dbPoolSaturationGauge = new client.Gauge({
      name: 'wasel_db_pool_saturation_ratio',
      help: 'Ratio of active database connections to maximum pool capacity (0.0 to 1.0)',
      registers: [this.registry],
    });

    this.dbPoolActiveGauge = new client.Gauge({
      name: 'wasel_db_pool_active_connections',
      help: 'Number of active queries currently utilizing the database pool',
      registers: [this.registry],
    });

    this.dbPoolMaxGauge = new client.Gauge({
      name: 'wasel_db_pool_max_connections',
      help: 'Maximum configured capacity of the database connection pool',
      registers: [this.registry],
    });

    this.matchingDurationSeconds = new client.Histogram({
      name: 'wasel_matching_duration_seconds',
      help: 'Duration in seconds of PostGIS driver spatial matching queries',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    const statusStr = statusCode.toString();
    this.httpRequestsTotal.inc({ method, route, status_code: statusStr });
    this.httpRequestDurationSeconds.observe({ method, route, status_code: statusStr }, durationSeconds);

    if (statusCode >= 500) {
      this.http5xxRate.inc({ route });
    }
  }

  recordOtpDelivery(status: 'success' | 'failure', provider: string) {
    this.otpDeliveryTotal.inc({ status, provider });
  }

  recordMatchingDuration(operation: 'findEligibleDrivers' | 'getNearbyOrders', durationSeconds: number) {
    this.matchingDurationSeconds.observe({ operation }, durationSeconds);
  }

  async updateDynamicMetrics(): Promise<void> {
    // 1. Update Database Connection Pool metrics
    try {
      const pool = this.dbService.getPoolMetrics();
      this.dbPoolActiveGauge.set(pool.active);
      this.dbPoolMaxGauge.set(pool.max);
      this.dbPoolSaturationGauge.set(pool.saturation);
    } catch {
      // ignore
    }

    // 2. Update Outbox lag metric
    try {
      const result = await this.dbService.db.execute(
        sql`SELECT COUNT(*)::int as count FROM app.outbox WHERE status IN ('pending', 'processing')`,
      );
      const resultObj = result as unknown as { rows?: Array<{ count?: number }> };
      const rows = resultObj?.rows || (Array.isArray(result) ? (result as Array<{ count?: number }>) : []);
      const count = rows[0]?.count ?? 0;
      this.outboxLagGauge.set(count);
    } catch {
      // ignore if outbox table not yet migrated or unavailable
    }
  }

  async getMetricsText(): Promise<string> {
    await this.updateDynamicMetrics();
    return this.registry.metrics();
  }
}
