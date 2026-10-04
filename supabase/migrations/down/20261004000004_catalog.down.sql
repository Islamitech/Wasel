-- ============================================================================
-- Rollback / Down Migration: 20261004000004_catalog.down.sql
-- ============================================================================

DROP TABLE IF EXISTS app.places CASCADE;
DROP TABLE IF EXISTS app.load_size_vehicle_types CASCADE;
DROP TABLE IF EXISTS app.load_sizes CASCADE;
DROP TABLE IF EXISTS app.service_actions CASCADE;
DROP TABLE IF EXISTS app.value_tiers CASCADE;
