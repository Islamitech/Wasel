import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.validation.js';

describe('OTP Security & Production Startup Validation', () => {
  const baseValidConfig = {
    DATABASE_URL: 'postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'super_secret_jwt_access_key_min_32_chars_long',
    JWT_REFRESH_SECRET: 'super_secret_jwt_refresh_key_min_32_chars_long',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  it('fails startup fast if NODE_ENV=production and OTP_PROVIDER=dev', () => {
    expect(() => {
      validateEnv({
        ...baseValidConfig,
        NODE_ENV: 'production',
        OTP_PROVIDER: 'dev',
      });
    }).toThrow(/OTP_PROVIDER cannot be .*dev.* in production environment/);
  });

  it('allows OTP_PROVIDER=dev in development and test environments', () => {
    const devConfig = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'development',
      OTP_PROVIDER: 'dev',
    });
    expect(devConfig.OTP_PROVIDER).toBe('dev');

    const testConfig = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'test',
      OTP_PROVIDER: 'dev',
    });
    expect(testConfig.OTP_PROVIDER).toBe('dev');
  });

  it('allows production startup with real SMS or WhatsApp provider', () => {
    const prodConfig = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'production',
      OTP_PROVIDER: 'sms',
    });
    expect(prodConfig.OTP_PROVIDER).toBe('sms');
  });
});
