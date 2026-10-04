import { uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { regions } from './regions.js';
import { orders } from './orders.js';
import { driverProfiles } from './verification.js';
import { geographyPoint } from '../../common/geo/index.js';

export const escalationRules = appSchema.table('escalation_rules', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').default(1).notNull(),
  initialRadiusMeters: integer('initial_radius_meters').default(2000).notNull(),
  stepRadiusMeters: integer('step_radius_meters').default(1000).notNull(),
  maxRadiusMeters: integer('max_radius_meters').default(7000).notNull(),
  stepTimeoutSeconds: integer('step_timeout_seconds').default(45).notNull(),
  maxSteps: integer('max_steps').default(4).notNull(),
  allowVehicleEscalation: boolean('allow_vehicle_escalation').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dispatchRuns = appSchema.table('dispatch_runs', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  currentStep: integer('current_step').default(1).notNull(),
  currentRadiusMeters: integer('current_radius_meters').notNull(),
  status: varchar('status', { length: 32 }).default('active').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const dispatchCandidates = appSchema.table('dispatch_candidates', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  dispatchRunId: uuid('dispatch_run_id').notNull().references(() => dispatchRuns.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  distanceMeters: integer('distance_meters').notNull(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  response: varchar('response', { length: 32 }).default('pending').notNull(),
});

export const driverLocations = appSchema.table('driver_locations', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  location: geographyPoint('location').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

export type EscalationRule = typeof escalationRules.$inferSelect;
export type DispatchRun = typeof dispatchRuns.$inferSelect;
export type DispatchCandidate = typeof dispatchCandidates.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
