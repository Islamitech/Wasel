import { pgTable, uuid, varchar, jsonb, timestamp, text, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { regions } from './regions.js';
import { users } from './users.js';

export const settings = pgTable('settings', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  key: varchar('key', { length: 128 }).notNull(),
  value: jsonb('value').notNull(),
  regionId: uuid('region_id').references(() => regions.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 64 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: varchar('entity_id', { length: 128 }),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const outbox = pgTable('outbox', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  eventName: varchar('event_name', { length: 128 }).notNull(),
  aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).default('pending').notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const vehicleTypes = pgTable('vehicle_types', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id).notNull(),
  code: varchar('code', { length: 32 }).notNull(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  nameEn: varchar('name_en', { length: 128 }).notNull(),
  maxWeightKg: integer('max_weight_kg').notNull(),
  maxVolumeCbm: integer('max_volume_cbm').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const serviceActions = pgTable('service_actions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id).notNull(),
  code: varchar('code', { length: 32 }).notNull(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  nameEn: varchar('name_en', { length: 128 }).notNull(),
  baseFeeCents: integer('base_fee_cents').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const valueTiers = pgTable('value_tiers', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id).notNull(),
  code: varchar('code', { length: 32 }).notNull(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  minValueCents: integer('min_value_cents').notNull(),
  maxValueCents: integer('max_value_cents').notNull(),
  requiredVehicleClasses: jsonb('required_vehicle_classes').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type OutboxRecord = typeof outbox.$inferSelect;
export type VehicleType = typeof vehicleTypes.$inferSelect;
export type ServiceAction = typeof serviceActions.$inferSelect;
export type ValueTierRecord = typeof valueTiers.$inferSelect;
