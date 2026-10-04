import { uuid, varchar, text, integer, numeric, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { users } from './users.js';
import { orders } from './orders.js';
import { customerProfiles, driverProfiles } from './verification.js';
import { geographyPoint } from '../../common/geo/index.js';

export const conversations = appSchema.table('conversations', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customerProfiles.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messages = appSchema.table('messages', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  content: text('content'),
  mediaKey: text('media_key'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ratings = appSchema.table('ratings', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  revieweeId: uuid('reviewee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  score: integer('score').notNull(),
  tags: text('tags').array().default([]),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const disputes = appSchema.table('disputes', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  filedBy: uuid('filed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: varchar('reason', { length: 64 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 32 }).default('opened').notNull(),
  assignedAdminId: uuid('assigned_admin_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const disputeEvents = appSchema.table('dispute_events', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  disputeId: uuid('dispute_id').notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  details: jsonb('details').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = appSchema.table('notifications', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  data: jsonb('data').default({}).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = appSchema.table('push_subscriptions', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderTrackingPoints = appSchema.table('order_tracking_points', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').notNull().references(() => driverProfiles.id, { onDelete: 'cascade' }),
  location: geographyPoint('location').notNull(),
  speedKmh: numeric('speed_kmh', { precision: 5, scale: 2 }),
  heading: numeric('heading', { precision: 5, scale: 2 }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type DisputeEvent = typeof disputeEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type OrderTrackingPoint = typeof orderTrackingPoints.$inferSelect;
