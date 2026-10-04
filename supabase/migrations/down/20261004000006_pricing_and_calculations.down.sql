-- ============================================================================
-- Rollback / Down Migration: 20261004000006_pricing_and_calculations.down.sql
-- ============================================================================

DROP FUNCTION IF EXISTS app.calculate_final_fare(UUID) CASCADE;
DROP FUNCTION IF EXISTS app.calculate_min_fare(UUID) CASCADE;
DROP FUNCTION IF EXISTS app.count_billable_visits(UUID) CASCADE;

DROP TABLE IF EXISTS app.fare_calculations CASCADE;
DROP TABLE IF EXISTS app.pricing_rules CASCADE;
