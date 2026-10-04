-- ============================================================================
-- Migration: 20261004000013_integrity_outbox_transitions.sql
-- Description: Transactional Outbox Hardening (attempts, next_attempt_at, locked_at, status check),
--              Strict RBAC enforcement in guard_status_transition via app.actor_role,
--              and Lifecycle Expiry Settings.
-- Reversible: Yes
-- ============================================================================

-- 1. Outbox columns and index
ALTER TABLE app.outbox
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Sync any existing retry_count into attempts
UPDATE app.outbox SET attempts = retry_count WHERE attempts = 0 AND retry_count > 0;

ALTER TABLE app.outbox DROP CONSTRAINT IF EXISTS chk_outbox_status;
ALTER TABLE app.outbox ADD CONSTRAINT chk_outbox_status CHECK (status IN ('pending', 'processing', 'processed', 'dead'));

CREATE INDEX IF NOT EXISTS idx_outbox_poll ON app.outbox(status, next_attempt_at) WHERE status IN ('pending', 'processing');

-- 2. Enhanced Guard Status Transition with Actor Role Verification
CREATE OR REPLACE FUNCTION app.guard_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_transition RECORD;
  v_actor_role TEXT;
BEGIN
  -- If status has not changed, proceed
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Verify transition exists in matrix
  SELECT allowed_roles
  INTO v_transition
  FROM app.status_transitions
  WHERE entity = TG_TABLE_NAME
    AND from_status = OLD.status
    AND to_status = NEW.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Illegal status transition for entity %: cannot transition from "%" to "%"',
      TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = '23514', HINT = 'ILLEGAL_TRANSITION';
  END IF;

  -- Role authorization check
  v_actor_role := current_setting('app.actor_role', true);
  IF v_actor_role IS NOT NULL AND v_actor_role <> '' THEN
    IF NOT (v_actor_role = ANY(v_transition.allowed_roles) OR v_actor_role IN ('admin', 'system')) THEN
      RAISE EXCEPTION 'Role "%" not authorized for transition on entity %: cannot transition from "%" to "%"',
        v_actor_role, TG_TABLE_NAME, OLD.status, NEW.status
        USING ERRCODE = '42501', HINT = 'UNAUTHORIZED_TRANSITION';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = app, extensions, pg_temp;

-- 3. Register Offers Lifecycle in app.status_transitions
INSERT INTO app.status_transitions (entity, from_status, to_status, allowed_roles, description)
VALUES
  ('offers', 'pending', 'accepted', '{customer,admin,system}', 'Customer accepts driver offer'),
  ('offers', 'pending', 'rejected', '{customer,driver,admin,system}', 'Offer rejected when order is agreed'),
  ('offers', 'pending', 'expired', '{system,admin}', 'Offer expired without acceptance'),
  ('offers', 'pending', 'withdrawn', '{driver,admin,system}', 'Driver withdrew offer')
ON CONFLICT (entity, from_status, to_status) DO NOTHING;

DROP TRIGGER IF EXISTS trg_offers_guard_status ON app.offers;
CREATE TRIGGER trg_offers_guard_status
  BEFORE UPDATE OF status ON app.offers
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

-- 4. Dynamic Platform Operational Defaults in app.settings
INSERT INTO app.settings (key, value)
VALUES
  ('order_ttl_minutes', '45'::jsonb),
  ('offer_ttl_minutes', '15'::jsonb),
  ('outbox_max_attempts', '5'::jsonb),
  ('outbox_retention_days', '7'::jsonb)
ON CONFLICT (key, COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
