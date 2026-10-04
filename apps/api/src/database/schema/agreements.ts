import { uuid, varchar, text, bigint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { orders } from './orders.js';
import { users } from './users.js';
import { customerProfiles, driverProfiles } from './verification.js';

export const offers = appSchema.table('offers', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  offeredFareMinor: bigint('offered_fare_minor', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  notes: text('notes'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agreements = appSchema.table('agreements', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customerProfiles.id, { onDelete: 'restrict' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'restrict' }),
  agreedFareMinor: bigint('agreed_fare_minor', { mode: 'number' }).notNull(),
  agreementSnapshot: jsonb('agreement_snapshot').notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agreementAmendments = appSchema.table('agreement_amendments', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  agreementId: uuid('agreement_id').notNull().references(() => agreements.id, { onDelete: 'cascade' }),
  proposedBy: uuid('proposed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  newFareMinor: bigint('new_fare_minor', { mode: 'number' }),
  addedStops: jsonb('added_stops'),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  reason: text('reason'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Offer = typeof offers.$inferSelect;
export type Agreement = typeof agreements.$inferSelect;
export type AgreementAmendment = typeof agreementAmendments.$inferSelect;
