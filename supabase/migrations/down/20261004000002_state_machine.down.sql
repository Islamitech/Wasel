-- ============================================================================
-- Rollback / Down Migration: 20261004000002_state_machine.down.sql
-- ============================================================================

DROP FUNCTION IF EXISTS app.guard_status_transition() CASCADE;
DROP TABLE IF EXISTS app.status_transitions CASCADE;
