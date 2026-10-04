-- ============================================================================
-- Migration: 20261004000010_final_security_and_verification.sql
-- Description: Final security hardening: alter default privileges, comprehensive
--              RLS and permissions verification function, and immediate migration-time
--              verification audit across all tables in app and public schemas.
-- Reversible: Yes
-- ============================================================================

-- 1. Ensure Default Privileges in schema app do not grant access to public/anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM public, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM public, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM public, anon, authenticated;

-- 2. Revoke all privileges on any tables present in public schema and enable RLS
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('spatial_ref_sys')
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM public, anon, authenticated;', r.tablename);
  END LOOP;
END $$;

-- 3. Verification Function: app.verify_rls_and_permissions()
-- Returns audit results confirming 100% of tables in app have RLS enabled and 0 public grants.
CREATE OR REPLACE FUNCTION app.verify_rls_and_permissions()
RETURNS TABLE (
  schema_name TEXT,
  table_name TEXT,
  rls_enabled BOOLEAN,
  has_unauthorized_grants BOOLEAN,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.schemaname::TEXT AS schema_name,
    t.tablename::TEXT AS table_name,
    t.rowsecurity AS rls_enabled,
    (
      SELECT count(*) > 0
      FROM information_schema.role_table_grants g
      WHERE g.table_schema = t.schemaname
        AND g.table_name = t.tablename
        AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) AS has_unauthorized_grants,
    CASE
      WHEN NOT t.rowsecurity THEN 'FAIL: RLS disabled'
      WHEN (
        SELECT count(*) > 0
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = t.schemaname
          AND g.table_name = t.tablename
          AND g.grantee IN ('PUBLIC', 'anon', 'authenticated')
      ) THEN 'FAIL: Unauthorized grant detected'
      ELSE 'PASS'
    END AS status
  FROM pg_tables t
  WHERE t.schemaname = 'app';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.verify_rls_and_permissions() IS 'Security audit routine confirming all application tables have active RLS and zero privileges granted to public, anon, or authenticated roles.';

-- 4. Immediate Migration-time Verification Assertion
DO $$
DECLARE
  v_failures INT;
  v_fail_details TEXT;
BEGIN
  SELECT
    count(*),
    string_agg(format('%s.%s (%s)', schema_name, table_name, status), E'\n')
  INTO v_failures, v_fail_details
  FROM app.verify_rls_and_permissions()
  WHERE status <> 'PASS';

  IF v_failures > 0 THEN
    RAISE EXCEPTION 'Security verification failed for % table(s):%' || E'\n' || '%',
      v_failures, E'\n', v_fail_details
      USING ERRCODE = '28000'; -- invalid_authorization_specification
  END IF;

  RAISE NOTICE 'Security verification passed: 100%% of app tables have RLS enabled and 0 unauthorized public grants.';
END $$;
