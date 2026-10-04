import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/config.service.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  private readonly fallbackMemory = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    @Optional()
    @Inject(AppConfigService)
    private readonly configService?: AppConfigService,
  ) {}

  async onModuleInit() {
    const redisUrl =
      this.configService?.get('REDIS_URL') || process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
      });

      this.client.on('error', (err) => {
        if (this.isConnected) {
          this.logger.warn(`Redis connection error: ${err.message}`);
        }
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('✅ Connected to Redis cache store');
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis not available (${msg}). Using local fast cache fallback.`);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback to memory on failure
      }
    }

    const item = this.fallbackMemory.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.fallbackMemory.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // Fallback to memory
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER;
    this.fallbackMemory.set(key, { value, expiresAt });
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // Fallback to memory
      }
    }

    const existing = await this.get(key);
    if (existing !== null) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch {}
    }
    this.fallbackMemory.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        const val = await this.client.incr(key);
        if (val === 1 && ttlSeconds) {
          await this.client.expire(key, ttlSeconds);
        }
        return val;
      } catch {}
    }

    const currentStr = await this.get(key);
    const count = (parseInt(currentStr || '0', 10) || 0) + 1;
    await this.set(key, count.toString(), ttlSeconds);
    return count;
  }
}
