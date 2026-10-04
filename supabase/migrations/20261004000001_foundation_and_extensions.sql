-- ============================================================================
-- Migration: 20261004000001_foundation_and_extensions.sql
-- Description: Foundation schema, extensions, base tables (Prompt 1 consolidated in app),
--              indexes, triggers, and default deny RLS with privilege revokes.
-- Reversible: Yes
-- ============================================================================

-- 1. Create Extensions Schema and Extensions
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA extensions;

-- 2. Dedicated Application Schema
CREATE SCHEMA IF NOT EXISTS app;

-- Explicitly revoke access on schema app from anon and authenticated roles
REVOKE ALL ON SCHEMA app FROM public, anon, authenticated;

-- 3. Utility Trigger Function: updated_at maintenance
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.set_updated_at() IS 'Trigger function automatically updating updated_at column to current timestamp on row update';

-- ============================================================================
-- Base Domain Tables (Consolidated into schema app)
-- ============================================================================

-- 4. Regions
CREATE TABLE IF NOT EXISTS app.regions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  name_en VARCHAR(128) NOT NULL,
  polygon_geojson JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.regions IS 'Geographical operating zones (e.g., Hadayek al-Ahram / Giza). Every domain record is region-scoped.';

CREATE TRIGGER trg_regions_updated_at
  BEFORE UPDATE ON app.regions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 5. Users
CREATE TABLE IF NOT EXISTS app.users (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  phone VARCHAR(20) UNIQUE,
  email extensions.citext UNIQUE,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  region_id UUID REFERENCES app.regions(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.users IS 'Core authentication and user identity entities.';
CREATE INDEX IF NOT EXISTS idx_users_region_id ON app.users(region_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON app.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON app.users(email);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 6. Roles
CREATE TABLE IF NOT EXISTS app.roles (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.roles IS 'Role definitions (customer, driver, admin, support).';

-- 7. Permissions
CREATE TABLE IF NOT EXISTS app.permissions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name VARCHAR(128) NOT NULL UNIQUE,
  resource VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.permissions IS 'Fine-grained RBAC permission privileges.';
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON app.permissions(resource, action);

-- 8. User Roles (Junction)
CREATE TABLE IF NOT EXISTS app.user_roles (
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE app.user_roles IS 'Mapping users to one or more roles.';
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON app.user_roles(role_id);

-- 9. Role Permissions (Junction)
CREATE TABLE IF NOT EXISTS app.role_permissions (
  role_id UUID NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE app.role_permissions IS 'Mapping roles to granted permissions.';
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON app.role_permissions(permission_id);

-- 10. Sessions (Tokens & Devices)
CREATE TABLE IF NOT EXISTS app.sessions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info VARCHAR(255),
  ip_address VARCHAR(64),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.sessions IS 'Active device sessions and hashed rotating refresh tokens.';
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON app.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON app.sessions(expires_at);

-- 11. OTP Challenges
CREATE TABLE IF NOT EXISTS app.otp_challenges (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  hashed_code VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  resend_available_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.otp_challenges IS 'Phone verification challenges with cooldowns, attempt counters, and expiry.';
CREATE INDEX IF NOT EXISTS idx_otp_challenges_phone_created ON app.otp_challenges(phone, created_at DESC);

-- 12. Settings (Data-driven system config)
CREATE TABLE IF NOT EXISTS app.settings (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL,
  region_id UUID REFERENCES app.regions(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.settings IS 'Global and region-scoped dynamic configuration entries.';
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key_region ON app.settings (key, COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_settings_region_id ON app.settings(region_id);
CREATE INDEX IF NOT EXISTS idx_settings_updated_by ON app.settings(updated_by);

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON app.settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 13. Audit Logs
CREATE TABLE IF NOT EXISTS app.audit_logs (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128),
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.audit_logs IS 'Immutable audit trail recording state modifications for sensitive operations.';
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON app.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON app.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON app.audit_logs(created_at DESC);

-- 14. Transactional Outbox
CREATE TABLE IF NOT EXISTS app.outbox (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_name VARCHAR(128) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE app.outbox IS 'Transactional outbox for reliable asynchronous event delivery.';
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON app.outbox(status, created_at) WHERE status = 'pending';

-- ============================================================================
-- Security: Row Level Security & Explicit Privilege Revocation
-- ============================================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'regions', 'users', 'roles', 'permissions', 'user_roles',
    'role_permissions', 'sessions', 'otp_challenges', 'settings',
    'audit_logs', 'outbox'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
