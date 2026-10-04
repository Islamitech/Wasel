import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Dedicated application schema for Wasel platform tables.
 * Isolated from PostgREST public exposure with strict RLS default-deny.
 */
export const appSchema = pgSchema('app');
