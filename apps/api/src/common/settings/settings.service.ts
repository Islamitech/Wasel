import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { settings } from '../../database/schema/index.js';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, any>();
  private cacheTtl = new Map<string, number>();
  private readonly TTL_MS = 60 * 1000; // 1 minute in-memory cache

  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  /**
   * Get typed setting value with caching and optional region fallback
   */
  async get<T>(key: string, regionId?: string, defaultValue?: T): Promise<T> {
    const cacheKey = `${regionId || 'global'}:${key}`;
    const cachedTime = this.cacheTtl.get(cacheKey);

    if (cachedTime && Date.now() - cachedTime < this.TTL_MS && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    try {
      // 1. Try region-specific setting if regionId provided
      if (regionId) {
        const [regionSetting] = await this.dbService.db
          .select()
          .from(settings)
          .where(and(eq(settings.key, key), eq(settings.regionId, regionId)));

        if (regionSetting) {
          const raw = regionSetting.value as Record<string, unknown> | null;
          const val = (raw && typeof raw === 'object' && 'value' in raw ? raw.value : regionSetting.value) as T;
          this.cache.set(cacheKey, val);
          this.cacheTtl.set(cacheKey, Date.now());
          return val;
        }
      }

      // 2. Fallback to global setting (regionId is null)
      const [globalSetting] = await this.dbService.db
        .select()
        .from(settings)
        .where(eq(settings.key, key));

      if (globalSetting) {
        const raw = globalSetting.value as Record<string, unknown> | null;
        const val = (raw && typeof raw === 'object' && 'value' in raw ? raw.value : globalSetting.value) as T;
        this.cache.set(cacheKey, val);
        this.cacheTtl.set(cacheKey, Date.now());
        return val;
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      throw new Error(`Setting key "${key}" not configured in database`);
    } catch (err: unknown) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error reading setting "${key}": ${msg}`);
      throw err;
    }
  }

  async getOrderTtlMinutes(regionId?: string): Promise<number> {
    const val = await this.get<number | string>('order_ttl_minutes', regionId, 45);
    return Number(val) || 45;
  }

  async getOfferTtlMinutes(regionId?: string): Promise<number> {
    const val = await this.get<number | string>('offer_ttl_minutes', regionId, 15);
    return Number(val) || 15;
  }

  async getOutboxMaxAttempts(): Promise<number> {
    const val = await this.get<number | string>('outbox_max_attempts', undefined, 5);
    return Number(val) || 5;
  }

  async getOutboxRetentionDays(): Promise<number> {
    const val = await this.get<number | string>('outbox_retention_days', undefined, 7);
    return Number(val) || 7;
  }

  /**
   * Update or set a setting value
   */
  async set(key: string, value: Record<string, unknown>, updatedBy?: string, regionId?: string): Promise<void> {
    const cacheKey = `${regionId || 'global'}:${key}`;
    this.cache.delete(cacheKey);
    this.cacheTtl.delete(cacheKey);

    const conditions = [eq(settings.key, key)];
    if (regionId) {
      conditions.push(eq(settings.regionId, regionId));
    }

    const existing = await this.dbService.db
      .select()
      .from(settings)
      .where(and(...conditions));

    if (existing.length > 0) {
      await this.dbService.db
        .update(settings)
        .set({
          value,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(settings.id, existing[0]!.id));
    } else {
      await this.dbService.db.insert(settings).values({
        key,
        value,
        regionId,
        updatedBy,
      });
    }

    this.logger.log(`Setting updated: ${key} (region: ${regionId || 'global'})`);
  }
}
