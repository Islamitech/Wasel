import { z } from 'zod';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    API_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
    DATABASE_URL: z
      .string()
      .default('postgresql://wasel_user:wasel_secret@localhost:5432/wasel_db'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
      .default('super_secret_jwt_access_key_min_32_chars_long'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters')
      .default('super_secret_jwt_refresh_key_min_32_chars_long'),
    JWT_ISSUER: z.string().default('wasel-api'),
    JWT_AUDIENCE: z.string().default('wasel-app'),
    ENCRYPTION_KEY: z
      .string()
      .length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
      .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    ENCRYPTION_KEY_ID: z.string().default('v1'),
    ENCRYPTION_KEYRING: z.string().optional(),
    STORAGE_ENDPOINT: z.string().default('localhost'),
    STORAGE_PORT: z.coerce.number().default(9000),
    STORAGE_USE_SSL: z
      .string()
      .transform((val) => val === 'true')
      .default('false'),
    STORAGE_ACCESS_KEY: z.string().default('minio_admin'),
    STORAGE_SECRET_KEY: z.string().default('minio_password'),
    STORAGE_PUBLIC_BUCKET: z.string().default('wasel-public'),
    STORAGE_PRIVATE_BUCKET: z.string().default('wasel-identity-private'),
    OTP_PROVIDER: z.enum(['dev', 'sms', 'whatsapp']).default('dev'),
    MAP_PROVIDER: z.enum(['dev', 'mapbox', 'google']).default('dev'),
    PUSH_PROVIDER: z.enum(['dev', 'webpush']).default('dev'),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional().default('mailto:admin@wasel.local'),
    TRUST_PROXY: z.string().default('false'),
    ENABLE_DOCS: z
      .string()
      .transform((val) => val === 'true')
      .default('false'),
  })
  .superRefine((data, ctx) => {
    const isProdOrStaging = data.APP_ENV === 'production' || data.APP_ENV === 'staging';

    // 1. Prevent OTP_PROVIDER=dev in production/staging or when NODE_ENV=production
    if ((data.NODE_ENV === 'production' || isProdOrStaging) && data.OTP_PROVIDER === 'dev') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTP_PROVIDER'],
        message: 'OTP_PROVIDER cannot be "dev" in production environment! Startup aborted.',
      });
    }

    if (isProdOrStaging) {
      // 2. Reject secrets starting with super_secret or matching placeholder
      if (
        data.JWT_ACCESS_SECRET.startsWith('super_secret') ||
        data.JWT_ACCESS_SECRET === 'super_secret_jwt_access_key_min_32_chars_long'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message:
            'JWT_ACCESS_SECRET cannot use placeholder or insecure "super_secret" prefix in production/staging',
        });
      }

      if (
        data.JWT_REFRESH_SECRET.startsWith('super_secret') ||
        data.JWT_REFRESH_SECRET === 'super_secret_jwt_refresh_key_min_32_chars_long'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message:
            'JWT_REFRESH_SECRET cannot use placeholder or insecure "super_secret" prefix in production/staging',
        });
      }

      // 3. Reject sequential or repeating pattern ENCRYPTION_KEY
      const sequentialPattern = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hasRepeatingChars = /(.)\1{7,}/.test(data.ENCRYPTION_KEY);
      const isSequentialHex = '0123456789abcdef'.repeat(4) === data.ENCRYPTION_KEY;
      if (data.ENCRYPTION_KEY === sequentialPattern || hasRepeatingChars || isSequentialHex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY cannot use sequential or repeating pattern in production/staging',
        });
      }

      // 4. Reject default MinIO credentials
      if (data.STORAGE_ACCESS_KEY === 'minio_admin' || data.STORAGE_SECRET_KEY === 'minio_password') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_ACCESS_KEY'],
          message: 'Default MinIO credentials not permitted in production/staging',
        });
      }

      // 5. Reject localhost CORS_ORIGINS
      if (
        !data.CORS_ORIGINS ||
        data.CORS_ORIGINS.includes('localhost') ||
        data.CORS_ORIGINS.includes('127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'Valid non-localhost CORS_ORIGINS required in production/staging',
        });
      }

      // 6. Reject MAP_PROVIDER=dev and PUSH_PROVIDER=dev
      if (data.MAP_PROVIDER === 'dev') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAP_PROVIDER'],
          message: 'MAP_PROVIDER cannot be "dev" in production/staging',
        });
      }

      if (data.PUSH_PROVIDER === 'dev') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PUSH_PROVIDER'],
          message: 'PUSH_PROVIDER cannot be "dev" in production/staging',
        });
      }

      // 7. Check TLS for DATABASE_URL and REDIS_URL
      if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Localhost DATABASE_URL not permitted in production/staging',
        });
      }

      if (data.REDIS_URL.includes('localhost') || data.REDIS_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'Localhost REDIS_URL not permitted in production/staging',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Environment validation failed! Boot aborted:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error(`Config validation error: ${result.error.message}`);
  }
  return result.data;
}
