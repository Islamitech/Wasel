-- ============================================================================
-- Migration: 20261004000010_final_security_and_verification.sql
-- Description: Final security hardening: alter default privileges, comprehensive
--              RLS, functions search_path and EXECUTE revocation verification audit
--              across all tables and routines in app and public schemas.
-- Reversible: Yes
-- ============================================================================

-- 1. Ensure Default Privileges in schema app do not grant ANY access to public/anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM public, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON FUNCTIONS FROM public, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON ROUTINES FROM public, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON SEQUENCES FROM public, anon, authenticated;

-- 2. Explicitly revoke EXECUTE on all existing functions in schema app
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM public, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA app FROM public, anon, authenticated;

-- 3. Revoke all privileges on any tables present in public schema and enable RLS
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

-- 4. Verification Function: app.verify_rls_and_permissions()
-- Returns audit results confirming 100% of tables in app have RLS enabled and 0 public grants,
-- and that all functions are safe (no unfixed search_path, zero public EXECUTE).
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
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = app, extensions, pg_temp;

COMMENT ON FUNCTION app.verify_rls_and_permissions() IS 'Security audit routine confirming all application tables have active RLS and zero privileges granted to public, anon, or authenticated roles.';

-- Ensure newly defined audit routine has no public execution grants
REVOKE ALL ON FUNCTION app.verify_rls_and_permissions() FROM public, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM public, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA app FROM public, anon, authenticated;

-- 5. Immediate Migration-time Verification Assertion
DO $$
DECLARE
  v_failures INT;
  v_fail_details TEXT;
  v_unsafe_funcs INT;
  v_unauth_executes INT;
BEGIN
  -- A. Verify Tables RLS and Grants
  SELECT
    count(*),
    string_agg(format('%s.%s (%s)', schema_name, table_name, status), E'\n')
  INTO v_failures, v_fail_details
  FROM app.verify_rls_and_permissions()
  WHERE status <> 'PASS';

  IF v_failures > 0 THEN
    RAISE EXCEPTION 'Security verification failed for % table(s): %', v_failures, v_fail_details
      USING ERRCODE = '28000'; -- invalid_authorization_specification
  END IF;

  -- B. Verify No SECURITY DEFINER functions without fixed search_path
  SELECT count(*)
  INTO v_unsafe_funcs
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'app'
    AND p.prosecdef = true
    AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') LIKE '%search_path=%');

  IF v_unsafe_funcs > 0 THEN
    RAISE EXCEPTION 'Security check failed: Found % SECURITY DEFINER function(s) in schema app without a fixed search_path!', v_unsafe_funcs
      USING ERRCODE = '28000';
  END IF;

  -- C. Verify zero EXECUTE grants to public/anon/authenticated
  SELECT count(*)
  INTO v_unauth_executes
  FROM information_schema.routine_privileges rp
  WHERE rp.routine_schema = 'app'
    AND rp.grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND rp.privilege_type = 'EXECUTE';

  IF v_unauth_executes > 0 THEN
    RAISE EXCEPTION 'Security check failed: % function(s) in schema app have unauthorized EXECUTE permissions granted to public/anon/authenticated!', v_unauth_executes
      USING ERRCODE = '28000';
  END IF;

  RAISE NOTICE 'Security verification passed: 100%% of app tables have RLS enabled, 0 unauthorized table grants, 0 unsafe SECURITY DEFINER functions, and 0 public function EXECUTE grants.';
END $$;
