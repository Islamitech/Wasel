import { uuid, varchar, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';

export const regions = appSchema.table('regions', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  nameAr: varchar('name_ar', { length: 128 }).notNull(),
  nameEn: varchar('name_en', { length: 128 }).notNull(),
  polygonGeojson: jsonb('polygon_geojson'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
