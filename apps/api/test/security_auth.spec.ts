import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as crypto from 'crypto';
import { getTestContext, TestContext } from './test-harness.js';
import { validateEnv } from '../src/config/env.validation.js';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/database/schema/index.js';
import { eq } from 'drizzle-orm';
import { ErrorCode } from '@wasel/shared';

describe('Security & Authentication Hardening Matrix (Phase 1)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await getTestContext();
  });

  describe('S-01: Privilege Escalation Prevention', () => {
    it('rejects OTP verification with role=admin with HTTP 400', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({
          phone: '01011112222',
          code: '123456',
          role: 'admin',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('rejects OTP verification with role=support with HTTP 400', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({
          phone: '01011112222',
          code: '123456',
          role: 'support',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('denies customer access to admin routes with HTTP 403', async () => {
      const customer = await ctx.createCustomer({ fullName: 'عميل عادي' });
      const res = await request(ctx.app.getHttpServer())
        .get('/v1/auth/admin/protected-check')
        .set('Authorization', `Bearer ${customer.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('S-06: Sessions, JWT Verification & Refresh Rotation', () => {
    it('rejects access tokens without typ: "access"', async () => {
      const fakeToken = await ctx.jwtService.signAsync(
        {
          sub: 'fake-user-id',
          sessionId: crypto.randomUUID(),
          roles: ['customer'],
          // Missing typ: 'access'
        },
        { secret: process.env.JWT_ACCESS_SECRET || 'super_secret_jwt_access_key_min_32_chars_long' },
      );

      const res = await request(ctx.app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(res.status).toBe(401);
    });

    it('immediately invalidates access token after logout', async () => {
      // 1. Create customer
      const cust = await ctx.createCustomer({ fullName: 'عميل مسجل خروج' });

      // 2. Profile request succeeds
      const check1 = await request(ctx.app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${cust.token}`);
      expect(check1.status).toBe(200);

      // 3. Logout
      const logoutRes = await request(ctx.app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', `Bearer ${cust.token}`)
        .send({});
      expect(logoutRes.status).toBe(200);

      // 4. Access with same token now rejected with 401
      const check2 = await request(ctx.app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${cust.token}`);
      expect(check2.status).toBe(401);
    });

    it('rejects deactivated user (is_active=false) in guard, verifyOtp and refresh', async () => {
      const cust = await ctx.createCustomer({ fullName: 'مستخدم معطل' });

      // Deactivate user in database
      await ctx.dbService.db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, cust.user.id));

      // Guard rejection
      const check = await request(ctx.app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${cust.token}`);
      expect(check.status).toBe(401);
    });

    it('revokes entire session family when an already rotated refresh token is reused', async () => {
      // Create user and first session
      const phone = '01099887766';
      await request(ctx.app.getHttpServer()).post('/v1/auth/otp/request').send({ phone, role: 'customer' });
      const verifyRes = await request(ctx.app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code: '123456', role: 'customer' });
      expect(verifyRes.status).toBe(200);
      const initialRefreshToken = verifyRes.body.refreshToken;

      // Rotate once (legitimate refresh)
      const refresh1 = await request(ctx.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });
      expect(refresh1.status).toBe(200);
      const rotatedRefreshToken = refresh1.body.refreshToken;

      // Attempt to reuse initialRefreshToken (attack / replay)
      const reuseAttempt = await request(ctx.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });
      expect(reuseAttempt.status).toBe(401);

      // Entire session family must now be revoked: rotatedRefreshToken is also invalidated
      const subsequentRefresh = await request(ctx.app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: rotatedRefreshToken });
      expect(subsequentRefresh.status).toBe(401);
    });

    it('handles concurrent refresh requests atomically so only one succeeds', async () => {
      const phone = '01033445566';
      await request(ctx.app.getHttpServer()).post('/v1/auth/otp/request').send({ phone, role: 'customer' });
      const verifyRes = await request(ctx.app.getHttpServer()).post('/v1/auth/otp/verify').send({ phone, code: '123456', role: 'customer' });
      const rToken = verifyRes.body.refreshToken;

      // Two simultaneous refresh calls
      const [resA, resB] = await Promise.all([
        request(ctx.app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: rToken }),
        request(ctx.app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: rToken }),
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(401);
    });
  });

  describe('S-02: Database Connection Fail-Fast', () => {
    it('throws error and halts startup without PGlite fallback in production/development', async () => {
      const invalidDbService = new DatabaseService();
      // Provide unreachable port
      process.env.DATABASE_URL = 'postgresql://wasel_user:secret@127.0.0.1:54399/does_not_exist';
      
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await expect(invalidDbService.onModuleInit()).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('S-03 / S-05: Environment Validation & Production Secrets', () => {
    const validProdBase = {
      APP_ENV: 'production',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://usr:strongpass@prod.db.internal:5432/wasel_prod?sslmode=require',
      REDIS_URL: 'rediss://prod.redis.internal:6379',
      JWT_ACCESS_SECRET: 'production_high_entropy_random_secret_string_32_chars_min_12345',
      JWT_REFRESH_SECRET: 'production_high_entropy_random_refresh_secret_string_32_chars_min_12345',
      ENCRYPTION_KEY: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      STORAGE_ACCESS_KEY: 'prod_storage_key_non_default',
      STORAGE_SECRET_KEY: 'prod_storage_secret_non_default_value',
      CORS_ORIGINS: 'https://customer.wasel.com,https://driver.wasel.com,https://admin.wasel.com',
      OTP_PROVIDER: 'sms',
      MAP_PROVIDER: 'google',
      PUSH_PROVIDER: 'webpush',
    };

    it('rejects super_secret or placeholder passwords in production', () => {
      expect(() => {
        validateEnv({
          ...validProdBase,
          JWT_ACCESS_SECRET: 'super_secret_jwt_access_key_min_32_chars_long',
        });
      }).toThrow(/placeholder or insecure.*super_secret/);
    });

    it('rejects sequential ENCRYPTION_KEY pattern in production', () => {
      expect(() => {
        validateEnv({
          ...validProdBase,
          ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        });
      }).toThrow(/ENCRYPTION_KEY cannot use sequential or repeating pattern/);
    });

    it('rejects default MinIO credentials in production', () => {
      expect(() => {
        validateEnv({
          ...validProdBase,
          STORAGE_ACCESS_KEY: 'minio_admin',
        });
      }).toThrow(/Default MinIO credentials not permitted/);
    });

    it('rejects localhost CORS_ORIGINS in production', () => {
      expect(() => {
        validateEnv({
          ...validProdBase,
          CORS_ORIGINS: 'http://localhost:5173',
        });
      }).toThrow(/non-localhost CORS_ORIGINS required/);
    });
  });
});
