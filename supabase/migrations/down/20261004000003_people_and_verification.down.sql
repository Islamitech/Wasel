-- ============================================================================
-- Rollback / Down Migration: 20261004000003_people_and_verification.down.sql
-- ============================================================================

DROP TABLE IF EXISTS app.verification_documents CASCADE;
DROP TABLE IF EXISTS app.vehicles CASCADE;
DROP TABLE IF EXISTS app.driver_profiles CASCADE;
DROP TABLE IF EXISTS app.vehicle_types CASCADE;
DROP TABLE IF EXISTS app.customer_profiles CASCADE;
DROP TABLE IF EXISTS app.verification_levels CASCADE;
