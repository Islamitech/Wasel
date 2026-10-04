import { uuid, varchar, text, integer, bigint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { regions } from './regions.js';
import { users } from './users.js';
import { vehicleTypes } from './verification.js';
import { geographyPoint } from '../../common/geo/index.js';

export const valueTiers = appSchema.table('value_tiers', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  minMinor: bigint('min_minor', { mode: 'number' }).notNull(),
  maxMinor: bigint('max_minor', { mode: 'number' }),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const serviceActions = appSchema.table('service_actions', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull(),
  config: jsonb('config').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const loadSizes = appSchema.table('load_sizes', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  description: text('description'),
  rank: integer('rank').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const loadSizeVehicleTypes = appSchema.table('load_size_vehicle_types', {
  loadSizeId: uuid('load_size_id').notNull().references(() => loadSizes.id, { onDelete: 'cascade' }),
  vehicleTypeId: uuid('vehicle_type_id').notNull().references(() => vehicleTypes.id, { onDelete: 'cascade' }),
});

export const places = appSchema.table('places', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id, { onDelete: 'set null' }),
  source: varchar('source', { length: 32 }).notNull(),
  externalRef: varchar('external_ref', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 64 }),
  location: geographyPoint('location').notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ValueTier = typeof valueTiers.$inferSelect;
export type ServiceAction = typeof serviceActions.$inferSelect;
export type LoadSize = typeof loadSizes.$inferSelect;
export type Place = typeof places.$inferSelect;
