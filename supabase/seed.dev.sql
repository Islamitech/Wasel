-- ============================================================================
-- Supabase Development / Staging Seed File: supabase/seed.dev.sql
-- Description: Generates 50 synthetic driver (Captain) profiles clustered
--              around Hadayek al-Ahram (Giza, Egypt) with vehicles, subscriptions,
--              ratings, and PostGIS coordinates for local testing and dispatch simulation.
-- IMPORTANT: Never execute in production environments!
-- ============================================================================

DO $$
DECLARE
  v_region_id UUID;
  v_driver_role_id UUID;
  v_plan_trial UUID;
  v_plan_monthly UUID;
  v_lvl_1 UUID;
  v_lvl_2 UUID;
  v_lvl_3 UUID;
  v_vt_bike UUID;
  v_vt_motorcycle UUID;
  v_vt_tricycle UUID;
  v_vt_half_truck UUID;
  v_vt_jumbo UUID;

  v_first_names TEXT[] := ARRAY[
    'أحمد', 'محمد', 'محمود', 'إبراهيم', 'مصطفى', 'طارق', 'كريم', 'يوسف',
    'حسام', 'علي', 'عمر', 'خالد', 'سامح', 'شريف', 'رامي', 'وليد',
    'هاني', 'مروان', 'أيمن', 'عمرو', 'تامر', 'أشرف', 'باسم', 'سعيد', 'ياسر'
  ];

  v_last_names TEXT[] := ARRAY[
    'الشناوي', 'السيد', 'عبدالله', 'منصور', 'الصاوي', 'رمضان', 'عثمان', 'جمال',
    'البدري', 'سليمان', 'فاروق', 'شعبان', 'غنيم', 'فوزي', 'الحداد', 'الباشا',
    'النجار', 'راضي', 'حمزة', 'شحاتة', 'نصار', 'جلال', 'متولي', 'خليل', 'صابر'
  ];

  v_vehicle_types UUID[];
  v_plates_char TEXT[] := ARRAY['ق', 'ط', 'ف', 'س', 'ن', 'ر', 'ص', 'م', 'ب', 'د'];

  v_user_id UUID;
  v_full_name TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_lvl_id UUID;
  v_vtype_id UUID;
  v_plate TEXT;
  v_lat DOUBLE PRECISION;
  v_lon DOUBLE PRECISION;
  v_rating NUMERIC(3,2);
  v_trips INT;
  v_sub_plan UUID;
  i INT;
BEGIN
  -- 1. Look up prerequisite reference IDs
  SELECT id INTO v_region_id FROM app.regions WHERE code = 'hadayek_ahram';
  SELECT id INTO v_driver_role_id FROM app.roles WHERE name = 'driver';
  SELECT id INTO v_plan_trial FROM app.subscription_plans WHERE code = 'trial_30d';
  SELECT id INTO v_plan_monthly FROM app.subscription_plans WHERE code = 'monthly_standard';
  SELECT id INTO v_lvl_1 FROM app.verification_levels WHERE code = 'level_1_basic';
  SELECT id INTO v_lvl_2 FROM app.verification_levels WHERE code = 'level_2_verified';
  SELECT id INTO v_lvl_3 FROM app.verification_levels WHERE code = 'level_3_reputation';

  SELECT id INTO v_vt_bike FROM app.vehicle_types WHERE code = 'bicycle';
  SELECT id INTO v_vt_motorcycle FROM app.vehicle_types WHERE code = 'motorcycle';
  SELECT id INTO v_vt_tricycle FROM app.vehicle_types WHERE code = 'tricycle';
  SELECT id INTO v_vt_half_truck FROM app.vehicle_types WHERE code = 'half_truck';
  SELECT id INTO v_vt_jumbo FROM app.vehicle_types WHERE code = 'jumbo';

  v_vehicle_types := ARRAY[v_vt_bike, v_vt_motorcycle, v_vt_motorcycle, v_vt_tricycle, v_vt_half_truck, v_vt_jumbo];

  IF v_region_id IS NULL THEN
    RAISE EXCEPTION 'Prerequisite seed data missing. Run seed.sql before running seed.dev.sql';
  END IF;

  -- 2. Generate 50 Captains with RESERVED FAKE test numbers and identifiers
  FOR i IN 1..50 LOOP
    v_full_name := 'كابتن تجريبي ' || v_first_names[1 + ((i * 3 + 1) % array_length(v_first_names, 1))] || ' ' ||
                               v_last_names[1 + ((i * 7 + 3) % array_length(v_last_names, 1))];
    -- Reserved test phone pattern: +20 000 000 XXXX (000 is invalid unassigned carrier in Egypt)
    v_phone := '+20000000' || lpad(i::text, 4, '0');
    -- Reserved RFC 2606 .invalid test domain
    v_email := 'test.captain.' || i || '@test.wasel.invalid';

    -- Location spread within Hadayek al-Ahram gates (approx 29.968 to 29.982 N, 31.105 to 31.122 E)
    v_lat := 29.9680 + (mod(i * 17, 140) / 10000.0);
    v_lon := 31.1050 + (mod(i * 23, 170) / 10000.0);

    -- Verification level: Level 2 for majority, Level 3 for top, Level 1 for beginners
    IF i % 5 = 0 THEN
      v_lvl_id := v_lvl_3;
      v_rating := 4.85 + (mod(i, 15) / 100.0);
      v_trips := 120 + i * 2;
    ELSIF i % 3 = 0 THEN
      v_lvl_id := v_lvl_1;
      v_rating := 4.50 + (mod(i, 30) / 100.0);
      v_trips := 15 + i;
    ELSE
      v_lvl_id := v_lvl_2;
      v_rating := 4.70 + (mod(i, 25) / 100.0);
      v_trips := 40 + i * 2;
    END IF;

    -- Pick vehicle type: weighted towards motorcycle (motorcycle/tricycle common in Hadayek)
    v_vtype_id := v_vehicle_types[1 + (i % array_length(v_vehicle_types, 1))];
    -- Clearly fake test plate format
    v_plate := 'ت س ت ' || (1000 + i)::text;

    -- Subscription: 80% active trial, 20% active monthly
    IF i % 4 = 0 THEN
      v_sub_plan := v_plan_monthly;
    ELSE
      v_sub_plan := v_plan_trial;
    END IF;

    -- A. Insert or update User
    INSERT INTO app.users (phone, email, full_name, region_id, is_active)
    VALUES (v_phone, v_email, v_full_name, v_region_id, true)
    ON CONFLICT (phone) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email
    RETURNING id INTO v_user_id;

    -- B. Assign Driver Role
    INSERT INTO app.user_roles (user_id, role_id)
    VALUES (v_user_id, v_driver_role_id)
    ON CONFLICT DO NOTHING;

    -- C. Upsert Driver Profile
    INSERT INTO app.driver_profiles (
      id,
      region_id,
      status,
      verification_level_id,
      rating_avg,
      rating_count,
      completed_count,
      is_online,
      last_location,
      last_seen_at,
      acceptance_rate
    ) VALUES (
      v_user_id,
      v_region_id,
      'approved',
      v_lvl_id,
      v_rating,
      v_trips,
      v_trips,
      (i <= 42), -- 42 captains online out of 50
      extensions.ST_SetSRID(extensions.ST_MakePoint(v_lon, v_lat), 4326)::extensions.geography,
      now() - (mod(i, 30) || ' minutes')::interval,
      95.00 + (mod(i, 50) / 10.0)
    )
    ON CONFLICT (id) DO UPDATE
    SET status = 'approved',
        verification_level_id = EXCLUDED.verification_level_id,
        rating_avg = EXCLUDED.rating_avg,
        rating_count = EXCLUDED.rating_count,
        completed_count = EXCLUDED.completed_count,
        is_online = EXCLUDED.is_online,
        last_location = EXCLUDED.last_location,
        last_seen_at = EXCLUDED.last_seen_at;

    -- D. Upsert Vehicle
    DELETE FROM app.vehicles WHERE driver_id = v_user_id;
    INSERT INTO app.vehicles (
      driver_id,
      vehicle_type_id,
      plate,
      photo_key,
      status
    ) VALUES (
      v_user_id,
      v_vtype_id,
      v_plate,
      'dev/vehicles/v_' || i || '.jpg',
      'approved'
    );

    -- E. Upsert Active Subscription
    DELETE FROM app.subscriptions WHERE driver_id = v_user_id;
    INSERT INTO app.subscriptions (
      driver_id,
      plan_id,
      starts_at,
      ends_at,
      status,
      is_trial
    ) VALUES (
      v_user_id,
      v_sub_plan,
      now() - interval '5 days',
      now() + interval '25 days',
      'active',
      (v_sub_plan = v_plan_trial)
    );

  END LOOP;

  RAISE NOTICE 'Successfully seeded 50 synthetic Captains with vehicles and active subscriptions in Hadayek al-Ahram.';
END $$;
