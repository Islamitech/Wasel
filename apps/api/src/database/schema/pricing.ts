import { uuid, integer, bigint, numeric, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appSchema } from './common.js';
import { regions } from './regions.js';
import { orders } from './orders.js';

export const pricingRules = appSchema.table('pricing_rules', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  regionId: uuid('region_id').references(() => regions.id, { onDelete: 'cascade' }),
  stopFeeMinor: bigint('stop_fee_minor', { mode: 'number' }).default(1000).notNull(),
  waitFeePerHourMinor: bigint('wait_fee_per_hour_minor', { mode: 'number' }).default(3500).notNull(),
  goodsPercentRate: numeric('goods_percent_rate', { precision: 5, scale: 4 }).default('0.1000').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fareCalculations = appSchema.table('fare_calculations', {
  id: uuid('id').default(sql`extensions.gen_random_uuid()`).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  pricingRuleId: uuid('pricing_rule_id').notNull().references(() => pricingRules.id, { onDelete: 'restrict' }),
  billableVisitsCount: integer('billable_visits_count').notNull(),
  waitHours: numeric('wait_hours', { precision: 5, scale: 2 }).default('0').notNull(),
  totalInvoicesMinor: bigint('total_invoices_minor', { mode: 'number' }).default(0).notNull(),
  stopFeesTotalMinor: bigint('stop_fees_total_minor', { mode: 'number' }).notNull(),
  waitFeesTotalMinor: bigint('wait_fees_total_minor', { mode: 'number' }).notNull(),
  goodsFeesTotalMinor: bigint('goods_fees_total_minor', { mode: 'number' }).notNull(),
  calculatedFareMinor: bigint('calculated_fare_minor', { mode: 'number' }).notNull(),
  calculationDetails: jsonb('calculation_details').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PricingRule = typeof pricingRules.$inferSelect;
export type FareCalculation = typeof fareCalculations.$inferSelect;
