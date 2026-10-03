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
          const val = (regionSetting.value as any)?.value ?? regionSetting.value;
          this.cache.set(cacheKey, val);
          this.cacheTtl.set(cacheKey, Date.now());
          return val as T;
        }
      }

      // 2. Fallback to global setting (regionId is null)
      const [globalSetting] = await this.dbService.db
        .select()
        .from(settings)
        .where(eq(settings.key, key));

      if (globalSetting) {
        const val = (globalSetting.value as any)?.value ?? globalSetting.value;
        this.cache.set(cacheKey, val);
        this.cacheTtl.set(cacheKey, Date.now());
        return val as T;
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      throw new Error(`Setting key "${key}" not configured in database`);
    } catch (err: any) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      this.logger.error(`Error reading setting "${key}": ${err.message}`);
      throw err;
    }
  }

  /**
   * Update or set a setting value
   */
  async set(key: string, value: Record<string, any>, updatedBy?: string, regionId?: string): Promise<void> {
    const cacheKey = `${regionId || 'global'}:${key}`;
    this.cache.delete(cacheKey);
    this.cacheTtl.delete(cacheKey);

    const existing = await this.dbService.db
      .select()
      .from(settings)
      .where(and(eq(settings.key, key), regionId ? eq(settings.regionId, regionId) : undefined as any));

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
