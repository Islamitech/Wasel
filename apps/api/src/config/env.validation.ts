import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),
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
