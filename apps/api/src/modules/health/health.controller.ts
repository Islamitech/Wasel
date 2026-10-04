import { Controller, Get, HttpStatus, Res, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { RedisService } from '../../common/redis/redis.service.js';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service, DB, Redis, and Migrations are ready' })
  async ready(@Res() res: Response) {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';
    let latestMigration: string | null = null;
    let appliedAt: string | null = null;
    const errors: string[] = [];

    // 1. Check PostgreSQL
    try {
      await this.dbService.db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Database ping failed: ${msg}`);
    }

    // 2. Check Redis
    try {
      const isRedisOk = await this.redisService.ping();
      if (isRedisOk) {
        redisStatus = 'connected';
      } else {
        errors.push('Redis ping failed: service unreachable or returned non-PONG');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Redis error: ${msg}`);
    }

    // 3. Check Latest Migration
    if (dbStatus === 'connected') {
      try {
        const migrationRow = await this.dbService.db.execute(
          sql`SELECT name, applied_at FROM app.schema_migrations ORDER BY applied_at DESC LIMIT 1`,
        );
        const rows = (migrationRow as any)?.rows || (Array.isArray(migrationRow) ? migrationRow : []);
        if (rows.length > 0) {
          latestMigration = rows[0].name;
          appliedAt = rows[0].applied_at ? new Date(rows[0].applied_at).toISOString() : null;
        } else {
          latestMigration = 'none';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Schema migrations check failed: ${msg}`);
      }
    }

    const isReady = dbStatus === 'connected' && redisStatus === 'connected' && errors.length === 0;

    if (isReady) {
      return res.status(HttpStatus.OK).json({
        status: 'ready',
        database: dbStatus,
        redis: redisStatus,
        latestMigration,
        migrationAppliedAt: appliedAt,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      status: 'not_ready',
      database: dbStatus,
      redis: redisStatus,
      latestMigration,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
