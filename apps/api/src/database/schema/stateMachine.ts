import { uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';

export const statusTransitions = appSchema.table('status_transitions', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  entity: varchar('entity', { length: 64 }).notNull(),
  fromStatus: varchar('from_status', { length: 64 }).notNull(),
  toStatus: varchar('to_status', { length: 64 }).notNull(),
  allowedRoles: text('allowed_roles').array().notNull().default(sql`'{admin}'`),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type StatusTransition = typeof statusTransitions.$inferSelect;
export type NewStatusTransition = typeof statusTransitions.$inferInsert;
