-- ============================================================================
-- Rollback / Down Migration: 20261004000010_final_security_and_verification.down.sql
-- ============================================================================

DROP FUNCTION IF EXISTS app.verify_rls_and_permissions() CASCADE;
