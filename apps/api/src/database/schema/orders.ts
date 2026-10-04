import { uuid, varchar, text, integer, bigint, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { regions } from './regions.js';
import { users } from './users.js';
import { customerProfiles, driverProfiles } from './verification.js';
import { valueTiers, loadSizes, serviceActions, places } from './catalog.js';
import { geographyPoint } from '../../common/geo/index.js';

export const orders = appSchema.table('orders', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').notNull().references(() => regions.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').notNull().references(() => customerProfiles.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 32 }).default('draft').notNull(),
  valueTierId: uuid('value_tier_id').references(() => valueTiers.id, { onDelete: 'restrict' }),
  loadSizeId: uuid('load_size_id').references(() => loadSizes.id, { onDelete: 'restrict' }),
  waitMode: varchar('wait_mode', { length: 16 }).default('wait').notNull(),
  customerLocation: geographyPoint('customer_location').notNull(),
  minFareMinor: bigint('min_fare_minor', { mode: 'number' }).default(0).notNull(),
  pricingSnapshot: jsonb('pricing_snapshot'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
  cancelReason: text('cancel_reason'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const stops = appSchema.table('stops', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  actionId: uuid('action_id').notNull().references(() => serviceActions.id, { onDelete: 'restrict' }),
  placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
  location: geographyPoint('location').notNull(),
  description: text('description'),
  contactPhone: varchar('contact_phone', { length: 20 }),
  notes: text('notes'),
  expectedDurationMinutes: integer('expected_duration_minutes').default(0).notNull(),
  invoiceRequired: boolean('invoice_required').default(false).notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderMedia = appSchema.table('order_media', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id').references(() => stops.id, { onDelete: 'set null' }),
  uploaderId: uuid('uploader_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  mediaType: varchar('media_type', { length: 32 }).notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stopVisits = appSchema.table('stop_visits', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id').notNull().references(() => stops.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'restrict' }),
  visitSeq: integer('visit_seq').default(1).notNull(),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }).defaultNow().notNull(),
  departedAt: timestamp('departed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = appSchema.table('invoices', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  stopId: uuid('stop_id').references(() => stops.id, { onDelete: 'set null' }),
  invoiceNumber: varchar('invoice_number', { length: 128 }),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  photoKey: text('photo_key'),
  verifiedByCustomer: boolean('verified_by_customer').default(false).notNull(),
  customerNote: text('customer_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentReceipts = appSchema.table('payment_receipts', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  collectedAmountMinor: bigint('collected_amount_minor', { mode: 'number' }).notNull(),
  receiptType: varchar('receipt_type', { length: 32 }).default('cash').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type Stop = typeof stops.$inferSelect;
export type OrderMedia = typeof orderMedia.$inferSelect;
export type StopVisit = typeof stopVisits.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PaymentReceipt = typeof paymentReceipts.$inferSelect;
