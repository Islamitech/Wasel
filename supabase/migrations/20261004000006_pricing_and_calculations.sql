-- ============================================================================
-- Migration: 20261004000006_pricing_and_calculations.sql
-- Description: Dynamic pricing rules, billable visits counting, minimum fare
--              estimation and final fare calculation functions.
-- Reversible: Yes
-- ============================================================================

-- 1. Pricing Rules Table
CREATE TABLE IF NOT EXISTS app.pricing_rules (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  region_id UUID REFERENCES app.regions(id) ON DELETE CASCADE,
  stop_fee_minor BIGINT NOT NULL DEFAULT 1000 CHECK (stop_fee_minor >= 0), -- 10 EGP
  wait_fee_per_hour_minor BIGINT NOT NULL DEFAULT 3500 CHECK (wait_fee_per_hour_minor >= 0), -- 35 EGP
  goods_percent_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1000 CHECK (goods_percent_rate >= 0.0000 AND goods_percent_rate <= 1.0000), -- 10%
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.pricing_rules IS 'Configurable fee structure per region (stop fees, hourly waiting fee, goods commission percent).';

CREATE INDEX IF NOT EXISTS idx_pricing_rules_region ON app.pricing_rules(region_id, is_active);

CREATE TRIGGER trg_pricing_rules_updated_at
  BEFORE UPDATE ON app.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed Default Pricing Rule for Giza / Hadayek al-Ahram
INSERT INTO app.pricing_rules (region_id, stop_fee_minor, wait_fee_per_hour_minor, goods_percent_rate, is_active)
SELECT id, 1000, 3500, 0.1000, true
FROM app.regions
WHERE code = 'hadayek_ahram'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Also seed a global fallback rule (region_id IS NULL)
INSERT INTO app.pricing_rules (region_id, stop_fee_minor, wait_fee_per_hour_minor, goods_percent_rate, is_active)
VALUES (NULL, 1000, 3500, 0.1000, true);

-- 2. Fare Calculations Audit Table
CREATE TABLE IF NOT EXISTS app.fare_calculations (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  pricing_rule_id UUID NOT NULL REFERENCES app.pricing_rules(id) ON DELETE RESTRICT,
  billable_visits_count INT NOT NULL,
  wait_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_invoices_minor BIGINT NOT NULL DEFAULT 0,
  stop_fees_total_minor BIGINT NOT NULL,
  wait_fees_total_minor BIGINT NOT NULL,
  goods_fees_total_minor BIGINT NOT NULL,
  calculated_fare_minor BIGINT NOT NULL,
  calculation_details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.fare_calculations IS 'Snapshot calculation history recording breakdown of driver fare components.';
CREATE INDEX IF NOT EXISTS idx_fare_calculations_order_id ON app.fare_calculations(order_id);

-- 3. Function: app.count_billable_visits
-- Rule: The customer's location counts as 1 billable visit ONLY when it has an explicit task
-- (pick/drop/etc.), counted once regardless of repeats. The implicit final delivery to the customer
-- is not billable. Each distinct external place or returned visit counts as 1 visit.
CREATE OR REPLACE FUNCTION app.count_billable_visits(p_order_id UUID)
RETURNS INT AS $$
DECLARE
  v_customer_loc extensions.geography;
  v_customer_visit_count INT := 0;
  v_external_visit_count INT := 0;
  v_has_visits_recorded BOOLEAN := false;
BEGIN
  -- 1. Retrieve order customer location
  SELECT customer_location INTO v_customer_loc
  FROM app.orders
  WHERE id = p_order_id;

  IF v_customer_loc IS NULL THEN
    RETURN 0;
  END IF;

  -- 2. Check if customer location has an explicit stop task (within 20 meters)
  SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END
  INTO v_customer_visit_count
  FROM app.stops
  WHERE order_id = p_order_id
    AND extensions.ST_DWithin(location, v_customer_loc, 20);

  -- 3. Check if actual stop_visits were tracked
  SELECT EXISTS (
    SELECT 1 FROM app.stop_visits WHERE order_id = p_order_id
  ) INTO v_has_visits_recorded;

  IF v_has_visits_recorded THEN
    -- Count distinct recorded visits outside customer location
    SELECT COUNT(*)
    INTO v_external_visit_count
    FROM app.stop_visits sv
    JOIN app.stops s ON sv.stop_id = s.id
    WHERE sv.order_id = p_order_id
      AND NOT extensions.ST_DWithin(s.location, v_customer_loc, 20);
  ELSE
    -- Pre-execution planning: group external stops by place_id or coordinates within 20m
    SELECT COUNT(DISTINCT COALESCE(place_id::text, extensions.ST_AsText(location)))
    INTO v_external_visit_count
    FROM app.stops
    WHERE order_id = p_order_id
      AND NOT extensions.ST_DWithin(location, v_customer_loc, 20);
  END IF;

  RETURN v_customer_visit_count + v_external_visit_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION app.count_billable_visits(UUID) IS 'Computes billable visit count respecting customer-point explicit task rules and external multi-stop deduplication.';

-- 4. Function: app.calculate_min_fare
-- Formula: MinFare = (Visits * StopFee) + (ExpectedWaitHours * WaitFee) + (GoodsPercent * Tier.Min)
CREATE OR REPLACE FUNCTION app.calculate_min_fare(p_order_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_order RECORD;
  v_rule RECORD;
  v_tier_min_minor BIGINT := 0;
  v_visits INT := 0;
  v_wait_hours NUMERIC(5,2) := 0;
  v_stop_fees BIGINT;
  v_wait_fees BIGINT;
  v_goods_fees BIGINT;
  v_total BIGINT;
BEGIN
  -- 1. Fetch order details
  SELECT o.*, vt.min_minor AS tier_min
  INTO v_order
  FROM app.orders o
  LEFT JOIN app.value_tiers vt ON o.value_tier_id = vt.id
  WHERE o.id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN 0;
  END IF;

  IF v_order.tier_min IS NOT NULL THEN
    v_tier_min_minor := v_order.tier_min;
  END IF;

  -- 2. Fetch active pricing rule for region (or global fallback)
  SELECT *
  INTO v_rule
  FROM app.pricing_rules
  WHERE (region_id = v_order.region_id OR region_id IS NULL)
    AND is_active = true
  ORDER BY region_id NULLS LAST, effective_from DESC
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    -- Builtin system defaults if no rules seeded
    v_rule.stop_fee_minor := 1000;
    v_rule.wait_fee_per_hour_minor := 3500;
    v_rule.goods_percent_rate := 0.1000;
  END IF;

  -- 3. Billable visits
  v_visits := app.count_billable_visits(p_order_id);

  -- 4. Expected wait hours
  SELECT COALESCE(SUM(expected_duration_minutes), 0) / 60.0
  INTO v_wait_hours
  FROM app.stops
  WHERE order_id = p_order_id;

  -- 5. Calculate components
  v_stop_fees := v_visits * v_rule.stop_fee_minor;
  v_wait_fees := ROUND(v_wait_hours * v_rule.wait_fee_per_hour_minor);
  v_goods_fees := ROUND(v_tier_min_minor * v_rule.goods_percent_rate);

  v_total := v_stop_fees + v_wait_fees + v_goods_fees;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION app.calculate_min_fare(UUID) IS 'Calculates recommended minimum driver fare based on visits, expected wait duration, and value tier minimum.';

-- 5. Function: app.calculate_final_fare
-- Formula: Fare = (Visits * StopFee) + (WaitHours * WaitFee) + (GoodsPercent * sum(Invoices))
CREATE OR REPLACE FUNCTION app.calculate_final_fare(p_order_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_order RECORD;
  v_rule RECORD;
  v_visits INT := 0;
  v_actual_wait_hours NUMERIC(5,2) := 0;
  v_total_invoices_minor BIGINT := 0;
  v_stop_fees BIGINT;
  v_wait_fees BIGINT;
  v_goods_fees BIGINT;
  v_total BIGINT;
BEGIN
  -- 1. Fetch order details
  SELECT *
  INTO v_order
  FROM app.orders
  WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN 0;
  END IF;

  -- 2. Fetch pricing rule
  SELECT *
  INTO v_rule
  FROM app.pricing_rules
  WHERE (region_id = v_order.region_id OR region_id IS NULL)
    AND is_active = true
  ORDER BY region_id NULLS LAST, effective_from DESC
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    v_rule.stop_fee_minor := 1000;
    v_rule.wait_fee_per_hour_minor := 3500;
    v_rule.goods_percent_rate := 0.1000;
  END IF;

  -- 3. Count billable visits
  v_visits := app.count_billable_visits(p_order_id);

  -- 4. Calculate actual wait time from stop_visits (or expected wait if no departed timestamps)
  SELECT COALESCE(
    SUM(EXTRACT(EPOCH FROM (COALESCE(departed_at, now()) - arrived_at)) / 3600.0),
    0
  )
  INTO v_actual_wait_hours
  FROM app.stop_visits
  WHERE order_id = p_order_id;

  IF v_actual_wait_hours = 0 THEN
    SELECT COALESCE(SUM(expected_duration_minutes), 0) / 60.0
    INTO v_actual_wait_hours
    FROM app.stops
    WHERE order_id = p_order_id;
  END IF;

  -- 5. Sum of actual verified/submitted invoices
  SELECT COALESCE(SUM(amount_minor), 0)
  INTO v_total_invoices_minor
  FROM app.invoices
  WHERE order_id = p_order_id;

  -- 6. Compute breakdown
  v_stop_fees := v_visits * v_rule.stop_fee_minor;
  v_wait_fees := ROUND(v_actual_wait_hours * v_rule.wait_fee_per_hour_minor);
  v_goods_fees := ROUND(v_total_invoices_minor * v_rule.goods_percent_rate);

  v_total := v_stop_fees + v_wait_fees + v_goods_fees;

  -- 7. Record calculation snapshot
  INSERT INTO app.fare_calculations (
    order_id,
    pricing_rule_id,
    billable_visits_count,
    wait_hours,
    total_invoices_minor,
    stop_fees_total_minor,
    wait_fees_total_minor,
    goods_fees_total_minor,
    calculated_fare_minor,
    calculation_details
  ) VALUES (
    p_order_id,
    v_rule.id,
    v_visits,
    v_actual_wait_hours,
    v_total_invoices_minor,
    v_stop_fees,
    v_wait_fees,
    v_goods_fees,
    v_total,
    jsonb_build_object(
      'rule_id', v_rule.id,
      'stop_fee_unit', v_rule.stop_fee_minor,
      'wait_fee_unit', v_rule.wait_fee_per_hour_minor,
      'goods_percent_rate', v_rule.goods_percent_rate,
      'visits', v_visits,
      'wait_hours', v_actual_wait_hours,
      'invoices_sum', v_total_invoices_minor
    )
  );

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.calculate_final_fare(UUID) IS 'Computes final billable fare from actual visits, waiting time, and verified invoice amounts.';

-- 6. Security: RLS & Revoke
ALTER TABLE app.pricing_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.pricing_rules FROM public, anon, authenticated;

ALTER TABLE app.fare_calculations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.fare_calculations FROM public, anon, authenticated;
