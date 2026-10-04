import { uuid, varchar, integer, bigint, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { driverProfiles } from './verification.js';

export const subscriptionPlans = appSchema.table('subscription_plans', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  nameEn: varchar('name_en', { length: 128 }),
  priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
  durationDays: integer('duration_days').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = appSchema.table('subscriptions', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  isTrial: boolean('is_trial').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptionPayments = appSchema.table('subscription_payments', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  paymentMethod: varchar('payment_method', { length: 32 }).default('manual_admin').notNull(),
  paymentRef: varchar('payment_ref', { length: 128 }),
  status: varchar('status', { length: 32 }).default('completed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
