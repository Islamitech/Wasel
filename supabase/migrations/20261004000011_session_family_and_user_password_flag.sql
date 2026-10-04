-- ============================================================================
-- Migration: 20261004000011_session_family_and_user_password_flag.sql
-- Description: Add family_id to sessions for refresh token family rotation,
--              and must_change_password to users for initial bootstrap security.
-- Reversible: Yes (see down/20261004000011_session_family_and_user_password_flag.down.sql)
-- ============================================================================

-- 1. Add family_id to sessions
ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS family_id UUID NOT NULL DEFAULT extensions.gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_sessions_family_id ON app.sessions(family_id);

COMMENT ON COLUMN app.sessions.family_id IS 'Cryptographic session family UUID for atomic refresh rotation and breach revocation.';

-- 2. Add must_change_password to users
ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app.users.must_change_password IS 'Enforces credential rotation upon first login for bootstrapped administrative accounts.';
