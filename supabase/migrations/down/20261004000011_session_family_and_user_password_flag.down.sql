-- ============================================================================
-- Down Migration: 20261004000011_session_family_and_user_password_flag.down.sql
-- Description: Revert family_id on sessions and must_change_password on users.
-- ============================================================================

DROP INDEX IF EXISTS app.idx_sessions_family_id;

ALTER TABLE app.sessions
  DROP COLUMN IF EXISTS family_id;

ALTER TABLE app.users
  DROP COLUMN IF EXISTS must_change_password;
