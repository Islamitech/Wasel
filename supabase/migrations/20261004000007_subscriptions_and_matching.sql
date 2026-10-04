-- ============================================================================
-- Migration: 20261004000007_subscriptions_and_matching.sql
-- Description: Driver subscriptions (plans, active subscription view),
--              matching escalation rules, dispatch runs, and high-performance
--              spatial driver matching query.
-- Reversible: Yes
-- ============================================================================

-- ============================================================================
-- 1. Subscriptions Domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.subscription_plans (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  name_en VARCHAR(128),
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  duration_days INT NOT NULL CHECK (duration_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.subscription_plans IS 'Configurable driver membership tiers and trial offerings.';

CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON app.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed Default Plans (including 30-day free trial)
INSERT INTO app.subscription_plans (code, name_ar, name_en, price_minor, duration_days, is_active)
VALUES
  ('trial_30d', 'فترة تجريبية مجانية (30 يوم)', 'Free 30-Day Trial', 0, 30, true),
  ('monthly_standard', 'اشتراك شهري أساسي', 'Monthly Standard', 15000, 30, true), -- 150 EGP
  ('quarterly_saver', 'اشتراك 3 شهور', 'Quarterly Saver', 40000, 90, true) -- 400 EGP
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES app.subscription_plans(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  is_trial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.subscriptions IS 'Driver active and historical platform memberships.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_driver_id ON app.subscriptions(driver_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_dates ON app.subscriptions(driver_id, status, starts_at, ends_at);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON app.subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_subscriptions_guard_status
  BEFORE UPDATE OF status ON app.subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

CREATE TABLE IF NOT EXISTS app.subscription_payments (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES app.subscriptions(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  payment_method VARCHAR(32) NOT NULL DEFAULT 'manual_admin',
  payment_ref VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.subscription_payments IS 'Audit log of driver subscription membership fees collected.';
CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON app.subscription_payments(subscription_id);

-- View: Active Drivers Subscription Status
CREATE OR REPLACE VIEW app.v_driver_active_subscription AS
SELECT DISTINCT driver_id
FROM app.subscriptions
WHERE status = 'active'
  AND now() >= starts_at
  AND now() <= ends_at;

COMMENT ON VIEW app.v_driver_active_subscription IS 'Drivers currently entitled to receive dispatches via active non-expired subscription.';

-- ============================================================================
-- 2. Matching and Escalation Domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.escalation_rules (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  region_id UUID REFERENCES app.regions(id) ON DELETE CASCADE,
  step_number INT NOT NULL DEFAULT 1,
  initial_radius_meters INT NOT NULL DEFAULT 2000,
  step_radius_meters INT NOT NULL DEFAULT 1000,
  max_radius_meters INT NOT NULL DEFAULT 7000,
  step_timeout_seconds INT NOT NULL DEFAULT 45,
  max_steps INT NOT NULL DEFAULT 4,
  allow_vehicle_escalation BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.escalation_rules IS 'Geographic and fleet escalation sequence parameters when orders are not promptly accepted.';

CREATE INDEX IF NOT EXISTS idx_escalation_rules_region ON app.escalation_rules(region_id, is_active);

CREATE TRIGGER trg_escalation_rules_updated_at
  BEFORE UPDATE ON app.escalation_rules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed escalation rule for Hadayek al-Ahram
INSERT INTO app.escalation_rules (region_id, step_number, initial_radius_meters, step_radius_meters, max_radius_meters, step_timeout_seconds, max_steps)
SELECT id, 1, 2000, 1000, 7000, 45, 4
FROM app.regions
WHERE code = 'hadayek_ahram'
LIMIT 1
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app.dispatch_runs (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  current_step INT NOT NULL DEFAULT 1,
  current_radius_meters INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE app.dispatch_runs IS 'Active order matching cycles broadcasting opportunities to candidate captains.';
CREATE INDEX IF NOT EXISTS idx_dispatch_runs_order_id ON app.dispatch_runs(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_runs_status ON app.dispatch_runs(status);

CREATE TABLE IF NOT EXISTS app.dispatch_candidates (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  dispatch_run_id UUID NOT NULL REFERENCES app.dispatch_runs(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  distance_meters INT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  response VARCHAR(32) NOT NULL DEFAULT 'pending',
  CONSTRAINT uq_dispatch_run_driver UNIQUE (dispatch_run_id, driver_id)
);

COMMENT ON TABLE app.dispatch_candidates IS 'Record of drivers notified per dispatch step with their response outcome.';
CREATE INDEX IF NOT EXISTS idx_dispatch_candidates_run ON app.dispatch_candidates(dispatch_run_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_candidates_driver ON app.dispatch_candidates(driver_id);

-- ============================================================================
-- 3. Core Spatial Matching Function (< 50ms)
-- ============================================================================
CREATE OR REPLACE FUNCTION app.find_eligible_drivers(
  p_order_id UUID,
  p_radius_meters INT DEFAULT 3000,
  p_allow_escalated_vehicles BOOLEAN DEFAULT false
)
RETURNS TABLE (
  driver_id UUID,
  full_name VARCHAR,
  phone VARCHAR,
  vehicle_type_code VARCHAR,
  vehicle_plate VARCHAR,
  distance_meters INT,
  rating_avg NUMERIC(3,2),
  verification_rank INT
) AS $$
DECLARE
  v_order RECORD;
  v_base_rank INT := 0;
BEGIN
  -- 1. Fetch order details
  SELECT o.id, o.customer_location, o.load_size_id, o.value_tier_id
  INTO v_order
  FROM app.orders o
  WHERE o.id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Minimum vehicle escalation rank required by load size
  SELECT COALESCE(MIN(vt.escalation_rank), 1)
  INTO v_base_rank
  FROM app.load_size_vehicle_types lsvt
  JOIN app.vehicle_types vt ON lsvt.vehicle_type_id = vt.id
  WHERE lsvt.load_size_id = v_order.load_size_id;

  -- 3. Spatial query joining verified, online, subscribed captains with eligible vehicles
  RETURN QUERY
  SELECT
    dp.id AS driver_id,
    u.full_name,
    u.phone,
    vt.code AS vehicle_type_code,
    v.plate AS vehicle_plate,
    ROUND(extensions.ST_Distance(dp.last_location, v_order.customer_location))::int AS distance_meters,
    dp.rating_avg,
    COALESCE(vl.rank, 0) AS verification_rank
  FROM app.driver_profiles dp
  JOIN app.users u ON dp.id = u.id
  -- Active subscription filter
  JOIN app.v_driver_active_subscription sub ON dp.id = sub.driver_id
  -- Verification level check
  LEFT JOIN app.verification_levels vl ON dp.verification_level_id = vl.id
  -- Approved vehicle matching load size requirement
  JOIN app.vehicles v ON v.driver_id = dp.id AND v.status = 'approved'
  JOIN app.vehicle_types vt ON v.vehicle_type_id = vt.id
  WHERE dp.is_online = true
    AND dp.status = 'approved'
    AND dp.last_location IS NOT NULL
    -- Spatial radius filter with GiST index
    AND extensions.ST_DWithin(dp.last_location, v_order.customer_location, p_radius_meters)
    -- Value tier verification gating: driver level must permit order value tier
    AND (
      v_order.value_tier_id IS NULL
      OR (vl.allowed_value_tier_ids IS NOT NULL AND v_order.value_tier_id = ANY(vl.allowed_value_tier_ids))
    )
    -- Vehicle capacity matching: either direct fit or escalated rank if permitted
    AND (
      (NOT p_allow_escalated_vehicles AND EXISTS (
        SELECT 1 FROM app.load_size_vehicle_types lsvt
        WHERE lsvt.load_size_id = v_order.load_size_id AND lsvt.vehicle_type_id = vt.id
      ))
      OR (p_allow_escalated_vehicles AND vt.escalation_rank >= v_base_rank)
    )
  ORDER BY distance_meters ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = app, extensions, pg_temp;

REVOKE EXECUTE ON FUNCTION app.find_eligible_drivers(UUID, INT, BOOLEAN) FROM public, anon, authenticated;

COMMENT ON FUNCTION app.find_eligible_drivers(UUID, INT, BOOLEAN) IS 'Ultra-fast PostGIS matching query filtering by distance, active subscription, verification level, and vehicle class capacity.';

-- ============================================================================
-- 4. Security: RLS & Revoke
-- ============================================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'subscription_plans', 'subscriptions', 'subscription_payments',
    'escalation_rules', 'dispatch_runs', 'dispatch_candidates'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;

REVOKE ALL ON app.v_driver_active_subscription FROM public, anon, authenticated;
