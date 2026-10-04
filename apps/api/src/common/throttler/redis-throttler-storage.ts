import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly memoryStorage = new Map<string, { totalHits: number; expiresAt: number; blockExpiresAt: number }>();

  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const client = this.redisService.getClient();

    if (client) {
      try {
        const blockKey = `${redisKey}:blocked`;
        const isBlockedVal = await client.get(blockKey);

        if (isBlockedVal) {
          const ttlBlock = await client.pttl(blockKey);
          return {
            totalHits: limit + 1,
            timeToExpire: Math.max(0, Math.ceil(ttlBlock / 1000)),
            isBlocked: true,
            timeToBlockExpire: Math.max(0, Math.ceil(ttlBlock / 1000)),
          };
        }

        const hits = await client.incr(redisKey);
        if (hits === 1) {
          await client.pexpire(redisKey, ttl);
        }

        const pttl = await client.pttl(redisKey);
        const timeToExpire = Math.max(0, Math.ceil(pttl / 1000));

        let isBlocked = false;
        let timeToBlockExpire = 0;

        if (hits > limit) {
          isBlocked = true;
          timeToBlockExpire = Math.ceil(blockDuration / 1000);
          if (blockDuration > 0) {
            await client.set(blockKey, '1', 'PX', blockDuration);
          }
        }

        return {
          totalHits: hits,
          timeToExpire,
          isBlocked,
          timeToBlockExpire,
        };
      } catch {
        // Fallback to memory below
      }
    }

    // In-memory fallback
    const now = Date.now();
    let record = this.memoryStorage.get(redisKey);

    if (!record || record.expiresAt < now) {
      record = {
        totalHits: 0,
        expiresAt: now + ttl,
        blockExpiresAt: 0,
      };
      this.memoryStorage.set(redisKey, record);
    }

    const isBlocked = record.blockExpiresAt > now;
    if (isBlocked) {
      return {
        totalHits: record.totalHits,
        timeToExpire: Math.max(0, Math.ceil((record.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(0, Math.ceil((record.blockExpiresAt - now) / 1000)),
      };
    }

    record.totalHits += 1;
    let timeToBlockExpire = 0;

    if (record.totalHits > limit) {
      record.blockExpiresAt = now + blockDuration;
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }

    return {
      totalHits: record.totalHits,
      timeToExpire: Math.max(0, Math.ceil((record.expiresAt - now) / 1000)),
      isBlocked: record.totalHits > limit,
      timeToBlockExpire,
    };
  }
}
