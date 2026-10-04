-- ============================================================================
-- Rollback / Down Migration: 20261004000001_foundation_and_extensions.down.sql
-- ============================================================================

DROP TABLE IF EXISTS app.outbox CASCADE;
DROP TABLE IF EXISTS app.audit_logs CASCADE;
DROP TABLE IF EXISTS app.settings CASCADE;
DROP TABLE IF EXISTS app.otp_challenges CASCADE;
DROP TABLE IF EXISTS app.sessions CASCADE;
DROP TABLE IF EXISTS app.role_permissions CASCADE;
DROP TABLE IF EXISTS app.user_roles CASCADE;
DROP TABLE IF EXISTS app.permissions CASCADE;
DROP TABLE IF EXISTS app.roles CASCADE;
DROP TABLE IF EXISTS app.users CASCADE;
DROP TABLE IF EXISTS app.regions CASCADE;

DROP FUNCTION IF EXISTS app.set_updated_at() CASCADE;

DROP SCHEMA IF EXISTS app CASCADE;
