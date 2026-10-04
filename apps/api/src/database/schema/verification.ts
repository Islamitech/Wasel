import { uuid, varchar, text, integer, numeric, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { users } from './users.js';
import { regions } from './regions.js';

export const verificationLevels = appSchema.table('verification_levels', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  rank: integer('rank').notNull(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  rules: jsonb('rules').notNull().default({}),
  allowedValueTierIds: uuid('allowed_value_tier_ids').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customerProfiles = appSchema.table('customer_profiles', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  regionId: uuid('region_id').references(() => regions.id, { onDelete: 'set null' }),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).default('5.00').notNull(),
  ratingCount: integer('rating_count').default(0).notNull(),
  completedCount: integer('completed_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vehicleTypes = appSchema.table('vehicle_types', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  maxWeightKg: integer('max_weight_kg').notNull(),
  maxVolumeM3: numeric('max_volume_m3', { precision: 5, scale: 2 }).notNull(),
  dimensions: jsonb('dimensions'),
  escalationRank: integer('escalation_rank').notNull(),
  icon: varchar('icon', { length: 64 }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const driverProfiles = appSchema.table('driver_profiles', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  regionId: uuid('region_id').references(() => regions.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  verificationLevelId: uuid('verification_level_id').references(() => verificationLevels.id, { onDelete: 'set null' }),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).default('5.00').notNull(),
  ratingCount: integer('rating_count').default(0).notNull(),
  completedCount: integer('completed_count').default(0).notNull(),
  isOnline: boolean('is_online').default(false).notNull(),
  lastLocation: text('last_location'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  acceptanceRate: numeric('acceptance_rate', { precision: 5, scale: 2 }).default('100.00').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const vehicles = appSchema.table('vehicles', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  vehicleTypeId: uuid('vehicle_type_id').notNull().references(() => vehicleTypes.id, { onDelete: 'restrict' }),
  plate: varchar('plate', { length: 64 }),
  photoKey: text('photo_key'),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const verificationDocuments = appSchema.table('verification_documents', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 64 }).notNull(),
  storageKey: text('storage_key').notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectReason: text('reject_reason'),
  encryptedMetadata: text('encrypted_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type VerificationLevel = typeof verificationLevels.$inferSelect;
export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type VehicleType = typeof vehicleTypes.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VerificationDocument = typeof verificationDocuments.$inferSelect;
