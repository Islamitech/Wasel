-- ============================================================================
-- Rollback / Down Migration: 20261004000007_subscriptions_and_matching.down.sql
-- ============================================================================

DROP FUNCTION IF EXISTS app.find_eligible_drivers(UUID, INT, BOOLEAN) CASCADE;
DROP VIEW IF EXISTS app.v_driver_active_subscription CASCADE;

DROP TABLE IF EXISTS app.dispatch_candidates CASCADE;
DROP TABLE IF EXISTS app.dispatch_runs CASCADE;
DROP TABLE IF EXISTS app.escalation_rules CASCADE;

DROP TABLE IF EXISTS app.subscription_payments CASCADE;
DROP TABLE IF EXISTS app.subscriptions CASCADE;
DROP TABLE IF EXISTS app.subscription_plans CASCADE;
