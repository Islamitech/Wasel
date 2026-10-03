import { pgTable, uuid, varchar, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const roles = pgTable('roles', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  name: varchar('name', { length: 128 }).notNull().unique(),
  resource: varchar('resource', { length: 64 }).notNull(),
  action: varchar('action', { length: 64 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
