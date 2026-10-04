-- ============================================================================
-- Migration: 20261004000008_offers_and_agreements.sql
-- Description: Driver offers, binding agreements with locked immutable snapshots,
--              partial unique active constraint, and agreement amendments.
-- Reversible: Yes
-- ============================================================================

-- 1. Offers Table
CREATE TABLE IF NOT EXISTS app.offers (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  offered_fare_minor BIGINT NOT NULL CHECK (offered_fare_minor >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  notes TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_offers_order_driver UNIQUE (order_id, driver_id)
);

COMMENT ON TABLE app.offers IS 'Price quotations proposed by drivers for an open order.';

CREATE INDEX IF NOT EXISTS idx_offers_order_id ON app.offers(order_id);
CREATE INDEX IF NOT EXISTS idx_offers_driver_id ON app.offers(driver_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON app.offers(status);

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON app.offers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 2. Agreements Table (Contract between Customer & Captain)
CREATE TABLE IF NOT EXISTS app.agreements (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES app.customer_profiles(id) ON DELETE RESTRICT,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE RESTRICT,
  agreed_fare_minor BIGINT NOT NULL CHECK (agreed_fare_minor >= 0),
  agreement_snapshot JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.agreements IS 'Binding delivery contract capturing immutable terms snapshot once accepted.';

-- Partial Unique Index: Only one active agreement allowed per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_agreements_active_per_order
  ON app.agreements (order_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agreements_customer_id ON app.agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_agreements_driver_id ON app.agreements(driver_id);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON app.agreements(status);

CREATE TRIGGER trg_agreements_updated_at
  BEFORE UPDATE ON app.agreements
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_agreements_guard_status
  BEFORE UPDATE OF status ON app.agreements
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

-- Trigger: Immutability of agreement snapshot and terms once locked_at is set
CREATE OR REPLACE FUNCTION app.enforce_agreement_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    -- Allow mutual amendment if an approved amendment exists for this agreement or bypass is active
    IF current_setting('app.allow_agreement_amendment', true) = 'on' THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM app.agreement_amendments
      WHERE agreement_id = NEW.id
        AND status = 'approved'
        AND (new_fare_minor = NEW.agreed_fare_minor OR NEW.agreed_fare_minor = OLD.agreed_fare_minor)
    ) THEN
      -- Customer, driver, and order IDs can never be altered even with amendment
      IF NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
         AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
         AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.agreement_snapshot IS DISTINCT FROM OLD.agreement_snapshot
       OR NEW.agreed_fare_minor IS DISTINCT FROM OLD.agreed_fare_minor
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'Agreement terms and snapshot are immutable once locked (locked_at: %)', OLD.locked_at
        USING ERRCODE = '23514'; -- check_violation
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = app, extensions, pg_temp;

REVOKE EXECUTE ON FUNCTION app.enforce_agreement_immutability() FROM public, anon, authenticated;

CREATE TRIGGER trg_agreements_immutability
  BEFORE UPDATE ON app.agreements
  FOR EACH ROW EXECUTE FUNCTION app.enforce_agreement_immutability();

-- 3. Agreement Amendments (Mid-trip changes in stops or pricing)
CREATE TABLE IF NOT EXISTS app.agreement_amendments (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES app.agreements(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  new_fare_minor BIGINT CHECK (new_fare_minor IS NULL OR new_fare_minor >= 0),
  added_stops JSONB,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reason TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.agreement_amendments IS 'Formal change requests to an ongoing trip agreement (e.g. additional stops or fare adjustments).';

CREATE INDEX IF NOT EXISTS idx_amendments_agreement_id ON app.agreement_amendments(agreement_id);
CREATE INDEX IF NOT EXISTS idx_amendments_status ON app.agreement_amendments(status);

-- 4. Security: RLS & Revoke
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'offers', 'agreements', 'agreement_amendments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
