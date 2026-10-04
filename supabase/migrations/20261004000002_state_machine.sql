-- ============================================================================
-- Migration: 20261004000002_state_machine.sql
-- Description: Generic data-driven state machine transition matrix and guard trigger
-- Reversible: Yes
-- ============================================================================

-- 1. Status Transitions Matrix Table
CREATE TABLE IF NOT EXISTS app.status_transitions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  entity VARCHAR(64) NOT NULL,
  from_status VARCHAR(64) NOT NULL,
  to_status VARCHAR(64) NOT NULL,
  allowed_roles TEXT[] NOT NULL DEFAULT '{admin}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_status_transition UNIQUE (entity, from_status, to_status)
);

COMMENT ON TABLE app.status_transitions IS 'Defines allowable state machine transitions per domain entity with authorized RBAC roles.';
CREATE INDEX IF NOT EXISTS idx_status_transitions_lookup ON app.status_transitions(entity, from_status, to_status);

-- 2. Guard Trigger Function
CREATE OR REPLACE FUNCTION app.guard_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_transition_exists BOOLEAN;
BEGIN
  -- If status has not changed, proceed
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Verify transition exists in matrix
  SELECT EXISTS (
    SELECT 1
    FROM app.status_transitions
    WHERE entity = TG_TABLE_NAME
      AND from_status = OLD.status
      AND to_status = NEW.status
  ) INTO v_transition_exists;

  IF NOT v_transition_exists THEN
    RAISE EXCEPTION 'Illegal status transition for entity %: cannot transition from "%" to "%"',
      TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.guard_status_transition() IS 'Generic before-update trigger rejecting transitions not registered in app.status_transitions';

-- 3. Seed Standard Lifecycle Transitions
INSERT INTO app.status_transitions (entity, from_status, to_status, allowed_roles, description)
VALUES
  -- Orders lifecycle
  ('orders', 'draft', 'published', '{customer,admin}', 'Customer publishes order request'),
  ('orders', 'draft', 'cancelled', '{customer,admin}', 'Customer cancels draft order'),
  ('orders', 'published', 'matching', '{system,customer,admin}', 'Matching engine begins driver dispatch'),
  ('orders', 'published', 'offers_received', '{system,driver,admin}', 'First driver offer submitted'),
  ('orders', 'published', 'cancelled', '{customer,admin}', 'Customer cancels published order'),
  ('orders', 'published', 'expired', '{system,admin}', 'Order expired without offers'),
  ('orders', 'matching', 'offers_received', '{system,driver,admin}', 'Driver submitted offer'),
  ('orders', 'matching', 'cancelled', '{customer,admin}', 'Customer cancelled while matching'),
  ('orders', 'matching', 'expired', '{system,admin}', 'Matching timeout reached'),
  ('orders', 'offers_received', 'agreed', '{customer,admin}', 'Customer accepts driver offer'),
  ('orders', 'offers_received', 'cancelled', '{customer,admin}', 'Customer cancelled before agreement'),
  ('orders', 'offers_received', 'expired', '{system,admin}', 'Offers expired without agreement'),
  ('orders', 'agreed', 'in_progress', '{driver,admin}', 'Driver starts order execution'),
  ('orders', 'agreed', 'cancelled', '{customer,driver,admin}', 'Agreement cancelled before pickup'),
  ('orders', 'in_progress', 'completed', '{driver,customer,admin}', 'Order completed successfully'),
  ('orders', 'in_progress', 'disputed', '{customer,driver,admin}', 'Dispute raised during execution'),
  ('orders', 'disputed', 'completed', '{admin}', 'Admin resolves dispute and closes as completed'),
  ('orders', 'disputed', 'cancelled', '{admin}', 'Admin resolves dispute and cancels order'),

  -- Driver profiles verification lifecycle
  ('driver_profiles', 'pending', 'under_review', '{admin}', 'Admin begins verification review'),
  ('driver_profiles', 'under_review', 'approved', '{admin}', 'Documents verified and driver approved'),
  ('driver_profiles', 'under_review', 'rejected', '{admin}', 'Verification rejected'),
  ('driver_profiles', 'rejected', 'under_review', '{admin,driver}', 'Driver resubmitted documents'),
  ('driver_profiles', 'approved', 'suspended', '{admin}', 'Driver suspended for policy violation'),
  ('driver_profiles', 'suspended', 'approved', '{admin}', 'Driver suspension lifted'),
  ('driver_profiles', 'suspended', 'deactivated', '{admin}', 'Driver permanently deactivated'),

  -- Agreements lifecycle
  ('agreements', 'active', 'fulfilled', '{system,driver,admin}', 'Agreement successfully fulfilled'),
  ('agreements', 'active', 'disputed', '{customer,driver,admin}', 'Agreement disputed'),
  ('agreements', 'active', 'cancelled', '{customer,driver,admin}', 'Agreement cancelled'),
  ('agreements', 'disputed', 'fulfilled', '{admin}', 'Dispute resolved with fulfillment'),
  ('agreements', 'disputed', 'cancelled', '{admin}', 'Dispute resolved with cancellation'),

  -- Disputes lifecycle
  ('disputes', 'opened', 'under_review', '{admin}', 'Admin starts dispute investigation'),
  ('disputes', 'under_review', 'resolved', '{admin}', 'Admin reached resolution'),
  ('disputes', 'under_review', 'dismissed', '{admin}', 'Dispute dismissed as invalid'),

  -- Subscriptions lifecycle
  ('subscriptions', 'pending', 'active', '{system,admin}', 'Subscription payment confirmed and activated'),
  ('subscriptions', 'active', 'expired', '{system,admin}', 'Subscription term elapsed'),
  ('subscriptions', 'active', 'cancelled', '{driver,admin}', 'Subscription cancelled'),
  ('subscriptions', 'expired', 'active', '{system,admin}', 'Subscription renewed')
ON CONFLICT (entity, from_status, to_status) DO NOTHING;

-- 4. Row Level Security & Explicit Privilege Revocation
ALTER TABLE app.status_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.status_transitions FROM public, anon, authenticated;
