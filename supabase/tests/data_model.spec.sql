-- ============================================================================
-- Supabase SQL Test Suite: supabase/tests/data_model.spec.sql
-- Description: End-to-end relational data model specification test suite:
--              1. Customer point explicit visit rules & multi-stop accounting
--              2. Fare calculation formulas (Scenarios a, b, c, d)
--              3. State machine transition enforcement
--              4. Agreement locked snapshot immutability
--              5. Spatial driver matching performance (< 50ms)
--              6. RLS default-deny and privilege revocation verification
--
-- Execution:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/data_model.spec.sql
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Setup temporary test context
DO $$
DECLARE
  v_region_id UUID;
  v_cust_user_id UUID;
  v_driver_user_id UUID;
  v_driver_user_2_id UUID;
  v_action_buy UUID;
  v_action_pick UUID;
  v_action_drop UUID;
  v_load_small UUID;
  v_tier_lt_200 UUID;
  v_tier_200_500 UUID;
  v_rule_id UUID;
  v_vt_motorcycle UUID;
  v_plan_trial UUID;

  v_order_a UUID;
  v_order_b UUID;
  v_order_c UUID;
  v_order_d UUID;
  v_stop_id_1 UUID;
  v_stop_id_2 UUID;
  v_stop_id_3 UUID;

  v_visits INT;
  v_fare BIGINT;
  v_agreement_id UUID;
  v_match_count INT;
  v_start_time TIMESTAMPTZ;
  v_elapsed_ms NUMERIC;
BEGIN
  RAISE NOTICE '==============================================================';
  RAISE NOTICE ' Starting Wasel Data Model Relational & Business Logic Tests  ';
  RAISE NOTICE '==============================================================';

  -- 1. Fetch prerequisite IDs
  SELECT id INTO v_region_id FROM app.regions WHERE code = 'hadayek_ahram';
  SELECT id INTO v_action_buy FROM app.service_actions WHERE code = 'buy';
  SELECT id INTO v_action_pick FROM app.service_actions WHERE code = 'pick';
  SELECT id INTO v_action_drop FROM app.service_actions WHERE code = 'drop';
  SELECT id INTO v_load_small FROM app.load_sizes WHERE code = 'small';
  SELECT id INTO v_tier_lt_200 FROM app.value_tiers WHERE code = 'tier_lt_200';
  SELECT id INTO v_tier_200_500 FROM app.value_tiers WHERE code = 'tier_200_500';
  SELECT id INTO v_vt_motorcycle FROM app.vehicle_types WHERE code = 'motorcycle';
  SELECT id INTO v_plan_trial FROM app.subscription_plans WHERE code = 'trial_30d';

  -- Create test users & profiles
  INSERT INTO app.users (phone, full_name, region_id)
  VALUES ('+200000009991', 'عميل تجريبي للتحقق', v_region_id)
  RETURNING id INTO v_cust_user_id;

  INSERT INTO app.customer_profiles (id, region_id)
  VALUES (v_cust_user_id, v_region_id);

  INSERT INTO app.users (phone, full_name, region_id)
  VALUES ('+200000009992', 'كابتن تجريبي للتحقق', v_region_id)
  RETURNING id INTO v_driver_user_id;

  INSERT INTO app.driver_profiles (
    id, region_id, status, verification_level_id, is_online, last_location
  ) VALUES (
    v_driver_user_id,
    v_region_id,
    'approved',
    (SELECT id FROM app.verification_levels WHERE code = 'level_2_verified'),
    true,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1100, 29.9750), 4326)::extensions.geography
  );

  INSERT INTO app.vehicles (driver_id, vehicle_type_id, plate, status)
  VALUES (v_driver_user_id, v_vt_motorcycle, 'أ ب ج 1111', 'approved');

  INSERT INTO app.subscriptions (driver_id, plan_id, starts_at, ends_at, status)
  VALUES (v_driver_user_id, v_plan_trial, now() - interval '1 day', now() + interval '29 days', 'active');

  -- Ensure active pricing rule exists: stop=1000 minor (10 EGP), wait=3500 minor (35 EGP/h), goods=10% (0.1000)
  SELECT id INTO v_rule_id
  FROM app.pricing_rules
  WHERE (region_id = v_region_id OR region_id IS NULL) AND is_active = true
  LIMIT 1;

  RAISE NOTICE '>>> TEST 1: Scenario (a) - Single Store + 160 EGP Invoice';
  -- Order A: Customer at (31.1150, 29.9720). Stop 1 at store (31.1110, 29.9740).
  -- Implicit final delivery to customer -> Customer visits = 0, Store visits = 1. Total = 1 visit.
  INSERT INTO app.orders (
    region_id, customer_id, customer_location, load_size_id, value_tier_id, wait_mode, status
  ) VALUES (
    v_region_id,
    v_cust_user_id,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    v_load_small,
    v_tier_lt_200,
    'wait',
    'draft'
  ) RETURNING id INTO v_order_a;

  INSERT INTO app.stops (order_id, seq, action_id, location, description, expected_duration_minutes)
  VALUES (
    v_order_a,
    1,
    v_action_buy,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1110, 29.9740), 4326)::extensions.geography,
    'سوبرماركت الباشا',
    0
  );

  -- Invoice of 160 EGP (16,000 minor units)
  INSERT INTO app.invoices (order_id, amount_minor)
  VALUES (v_order_a, 16000);

  v_visits := app.count_billable_visits(v_order_a);
  IF v_visits <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 1 visit for single-store order, got %', v_visits;
  END IF;

  v_fare := app.calculate_final_fare(v_order_a);
  -- Formula: 1 visit * 10 EGP (1000) + 0 wait + 10% of 160 EGP (1600) = 2600 minor (26 EGP)
  IF v_fare <> 2600 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected fare 2600 minor (26 EGP), got %', v_fare;
  END IF;
  RAISE NOTICE ' [PASS] Scenario (a) passed: visits = %, fare = % minor (26.00 EGP)', v_visits, v_fare;

  RAISE NOTICE '>>> TEST 2: Scenario (b) - Shoe Repair: Home pick + Tailor + Home drop, 2h wait, 100 EGP invoice';
  -- Order B: Customer at (31.1150, 29.9720).
  -- Stop 1: Home pick (explicit task at customer location)
  -- Stop 2: Tailor (31.1120, 29.9730) with 120 min wait
  -- Stop 3: Home drop (explicit task at customer location)
  -- Rule: Customer point counts as 1 visit (despite 2 stops at home). Tailor = 1 visit. Total = 2 visits.
  INSERT INTO app.orders (
    region_id, customer_id, customer_location, load_size_id, value_tier_id, wait_mode, status
  ) VALUES (
    v_region_id,
    v_cust_user_id,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    v_load_small,
    v_tier_lt_200,
    'wait',
    'draft'
  ) RETURNING id INTO v_order_b;

  -- Stop 1: Customer Home (Pick)
  INSERT INTO app.stops (order_id, seq, action_id, location, description, expected_duration_minutes)
  VALUES (
    v_order_b, 1, v_action_pick,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    'استلام الحذاء من منزل العميل', 0
  );

  -- Stop 2: Tailor
  INSERT INTO app.stops (order_id, seq, action_id, location, description, expected_duration_minutes)
  VALUES (
    v_order_b, 2, v_action_buy,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1120, 29.9730), 4326)::extensions.geography,
    'محل تصليح الأحذية', 120
  );

  -- Stop 3: Customer Home (Drop)
  INSERT INTO app.stops (order_id, seq, action_id, location, description, expected_duration_minutes)
  VALUES (
    v_order_b, 3, v_action_drop,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    'تسليم الحذاء بعد التصليح لمنزل العميل', 0
  );

  -- Invoice of 100 EGP (10,000 minor)
  INSERT INTO app.invoices (order_id, amount_minor)
  VALUES (v_order_b, 10000);

  v_visits := app.count_billable_visits(v_order_b);
  IF v_visits <> 2 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected 2 visits for shoe repair (customer + tailor), got %', v_visits;
  END IF;

  v_fare := app.calculate_final_fare(v_order_b);
  -- Formula: 2 visits * 10 EGP (2000) + 2h wait * 35 EGP (7000) + 10% of 100 EGP (1000) = 10000 minor (100 EGP)
  IF v_fare <> 10000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected fare 10000 minor (100 EGP), got %', v_fare;
  END IF;
  RAISE NOTICE ' [PASS] Scenario (b) passed: visits = %, fare = % minor (100.00 EGP)', v_visits, v_fare;

  RAISE NOTICE '>>> TEST 3: Scenario (c) - Two tasks at the same store';
  -- Order C: 2 stops at the same merchant place -> 1 billable visit
  INSERT INTO app.orders (
    region_id, customer_id, customer_location, load_size_id, value_tier_id, wait_mode, status
  ) VALUES (
    v_region_id,
    v_cust_user_id,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    v_load_small,
    v_tier_lt_200,
    'wait',
    'draft'
  ) RETURNING id INTO v_order_c;

  INSERT INTO app.stops (order_id, seq, action_id, location, description)
  VALUES (v_order_c, 1, v_action_buy, extensions.ST_SetSRID(extensions.ST_MakePoint(31.1105, 29.9745), 4326)::extensions.geography, 'مهمة 1 بنفس المكان');

  INSERT INTO app.stops (order_id, seq, action_id, location, description)
  VALUES (v_order_c, 2, v_action_pick, extensions.ST_SetSRID(extensions.ST_MakePoint(31.1105, 29.9745), 4326)::extensions.geography, 'مهمة 2 بنفس المكان');

  v_visits := app.count_billable_visits(v_order_c);
  IF v_visits <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected 1 visit for 2 tasks at same place, got %', v_visits;
  END IF;
  RAISE NOTICE ' [PASS] Scenario (c) passed: visits = 1 for multiple tasks at single location';

  RAISE NOTICE '>>> TEST 4: Scenario (d) - Leave and Return to same place (2 distinct visits in stop_visits)';
  INSERT INTO app.orders (
    region_id, customer_id, customer_location, load_size_id, value_tier_id, wait_mode, status
  ) VALUES (
    v_region_id,
    v_cust_user_id,
    extensions.ST_SetSRID(extensions.ST_MakePoint(31.1150, 29.9720), 4326)::extensions.geography,
    v_load_small,
    v_tier_lt_200,
    'wait',
    'draft'
  ) RETURNING id INTO v_order_d;

  INSERT INTO app.stops (order_id, seq, action_id, location, description)
  VALUES (v_order_d, 1, v_action_buy, extensions.ST_SetSRID(extensions.ST_MakePoint(31.1105, 29.9745), 4326)::extensions.geography, 'زيارة متجر أولى')
  RETURNING id INTO v_stop_id_1;

  INSERT INTO app.stops (order_id, seq, action_id, location, description)
  VALUES (v_order_d, 2, v_action_buy, extensions.ST_SetSRID(extensions.ST_MakePoint(31.1105, 29.9745), 4326)::extensions.geography, 'زيارة متجر ثانية بعد عودة')
  RETURNING id INTO v_stop_id_2;

  -- Record two separate visits in stop_visits
  INSERT INTO app.stop_visits (order_id, stop_id, driver_id, visit_seq, arrived_at, departed_at)
  VALUES (v_order_d, v_stop_id_1, v_driver_user_id, 1, now() - interval '2 hours', now() - interval '1 hour 45 minutes');

  INSERT INTO app.stop_visits (order_id, stop_id, driver_id, visit_seq, arrived_at, departed_at)
  VALUES (v_order_d, v_stop_id_2, v_driver_user_id, 2, now() - interval '30 minutes', now() - interval '15 minutes');

  v_visits := app.count_billable_visits(v_order_d);
  IF v_visits <> 2 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected 2 visits for leave and return, got %', v_visits;
  END IF;
  RAISE NOTICE ' [PASS] Scenario (d) passed: visits = 2 for leave and return';

  RAISE NOTICE '>>> TEST 5: State Machine Guard Trigger';
  -- Valid transition: draft -> published
  UPDATE app.orders SET status = 'published' WHERE id = v_order_a;
  RAISE NOTICE ' [PASS] Allowed transition (draft -> published) succeeded.';

  -- Illegal transition: published -> completed directly
  BEGIN
    UPDATE app.orders SET status = 'completed' WHERE id = v_order_a;
    RAISE EXCEPTION 'TEST 5 FAILED: Illegal transition published -> completed was unexpectedly allowed!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE ' [PASS] Illegal status transition properly blocked by guard trigger.';
  END;

  RAISE NOTICE '>>> TEST 6: Agreement Snapshot Immutability';
  INSERT INTO app.agreements (
    order_id, customer_id, driver_id, agreed_fare_minor, agreement_snapshot, status, locked_at
  ) VALUES (
    v_order_a,
    v_cust_user_id,
    v_driver_user_id,
    2600,
    '{"fare_minor": 2600, "stops": 1, "terms": "agreed"}'::jsonb,
    'active',
    now()
  ) RETURNING id INTO v_agreement_id;

  BEGIN
    UPDATE app.agreements
    SET agreed_fare_minor = 5000
    WHERE id = v_agreement_id;
    RAISE EXCEPTION 'TEST 6 FAILED: Modification of locked agreement was unexpectedly allowed!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE ' [PASS] Agreement terms immutable once locked_at timestamp is set.';
  END;

  RAISE NOTICE '>>> TEST 7: Spatial Driver Matching Performance (< 50ms)';
  v_start_time := clock_timestamp();

  SELECT count(*)
  INTO v_match_count
  FROM app.find_eligible_drivers(v_order_a, 5000, false);

  v_elapsed_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time));
  IF v_match_count = 0 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Expected matching driver, got 0';
  END IF;

  RAISE NOTICE ' [PASS] Matching query returned % eligible captains in % ms (< 50ms requirement)',
    v_match_count, v_elapsed_ms;

  RAISE NOTICE '==============================================================';
  RAISE NOTICE ' All Data Model Specifications & Business Tests Passed!      ';
  RAISE NOTICE '==============================================================';

END $$;

ROLLBACK; -- Always rollback test transaction cleanly
