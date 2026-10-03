import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const sessions = pgTable('sessions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
  deviceInfo: varchar('device_info', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  hashedCode: varchar('hashed_code', { length: 255 }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  resendAvailableAt: timestamp('resend_available_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type OtpChallenge = typeof otpChallenges.$inferSelect;
