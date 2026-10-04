-- ============================================================================
-- Supabase Production Seed File: supabase/seed.sql
-- Description: Idempotent reference data only (regions, roles, permissions,
--              verification levels, vehicle types, value tiers, service actions,
--              load sizes, pricing rules, escalation rules, and subscription plans).
-- Intended for: Production, Staging, and Local Development.
-- Contains ZERO synthetic user/driver records.
-- ============================================================================

-- 1. Base Region: Hadayek al-Ahram (Giza, Egypt)
INSERT INTO app.regions (code, name_ar, name_en, polygon_geojson, is_active)
VALUES (
  'hadayek_ahram',
  'حدائق الأهرام - الجيزة',
  'Hadayek al-Ahram - Giza',
  '{"type":"Polygon","coordinates":[[[31.1000,29.9650],[31.1250,29.9650],[31.1250,29.9850],[31.1000,29.9850],[31.1000,29.9650]]]}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    name_en = EXCLUDED.name_en,
    polygon_geojson = EXCLUDED.polygon_geojson,
    is_active = EXCLUDED.is_active;

-- 2. Core RBAC Roles
INSERT INTO app.roles (name, description)
VALUES
  ('customer', 'End customer ordering deliveries and errands'),
  ('driver', 'Captain executing deliveries and shopping errands'),
  ('admin', 'Platform administrator with complete privileges'),
  ('support', 'Customer support specialist handling inquiries and disputes')
ON CONFLICT (name) DO NOTHING;

-- 3. Core Permissions
INSERT INTO app.permissions (name, resource, action, description)
VALUES
  ('orders:create', 'orders', 'create', 'Create delivery and errand orders'),
  ('orders:read_own', 'orders', 'read_own', 'View own orders'),
  ('orders:read_any', 'orders', 'read_any', 'View any order in the platform'),
  ('orders:cancel', 'orders', 'cancel', 'Cancel an open order'),
  ('offers:create', 'offers', 'create', 'Submit price offer for an order'),
  ('agreements:sign', 'agreements', 'sign', 'Formally lock and accept delivery agreement'),
  ('disputes:create', 'disputes', 'create', 'Open dispute on an active or finished order'),
  ('disputes:resolve', 'disputes', 'resolve', 'Arbitrate and resolve disputes'),
  ('drivers:verify', 'drivers', 'verify', 'Review documents and verify captain profiles'),
  ('pricing:manage', 'pricing', 'manage', 'Configure fees, rates, and value tiers')
ON CONFLICT (name) DO NOTHING;

-- 4. Global Settings
INSERT INTO app.settings (key, value)
VALUES
  ('currency', '"EGP"'::jsonb),
  ('max_tasks_per_order', '8'::jsonb),
  ('default_phone_country_code', '"+20"'::jsonb),
  ('order_acceptance_timeout_seconds', '45'::jsonb)
ON CONFLICT (key, COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- 5. Verification Levels
INSERT INTO app.verification_levels (code, rank, name_ar, rules)
VALUES
  ('level_1_basic', 1, 'المستوى الأساسي (بطاقة ورخصة ومركبة)', '{"required_docs": ["national_id_front", "national_id_back", "driver_license", "vehicle_license"]}'::jsonb),
  ('level_2_verified', 2, 'المستوى الموثق (فيش وتشبيه جنائي سليم)', '{"required_docs": ["criminal_record"]}'::jsonb),
  ('level_3_reputation', 3, 'المستوى الذهبي (سمعة وتقييمات استثنائية)', '{"min_rating": 4.8, "min_trips": 100}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 6. Vehicle Types (Approved fleet: bicycle, motorcycle, tricycle, half-truck, jumbo)
INSERT INTO app.vehicle_types (code, name_ar, max_weight_kg, max_volume_m3, escalation_rank, icon)
VALUES
  ('bicycle', 'دراجة هوائية', 15, 0.05, 1, 'bike'),
  ('motorcycle', 'دراجة نارية (موتوسيكل)', 40, 0.15, 2, 'motorcycle'),
  ('tricycle', 'تروسيكل', 400, 1.50, 3, 'tricycle'),
  ('half_truck', 'نصف نقل (بيك آب)', 1200, 5.00, 4, 'truck-pickup'),
  ('jumbo', 'جامبو (نقل خفيف)', 3500, 15.00, 5, 'truck')
ON CONFLICT (code) DO NOTHING;

-- 7. Value Tiers (Minor units = piasters, 1 EGP = 100 piasters)
INSERT INTO app.value_tiers (code, name_ar, min_minor, max_minor, rank)
VALUES
  ('tier_lt_200', 'أقل من 200 ج.م', 0, 20000, 1),
  ('tier_200_500', 'من 200 إلى 500 ج.م', 20000, 50000, 2),
  ('tier_500_1000', 'من 500 إلى 1000 ج.م', 50000, 100000, 3),
  ('tier_1000_5000', 'من 1000 إلى 5000 ج.م', 100000, 500000, 4),
  ('tier_gt_5000', 'أكثر من 5000 ج.م', 500000, NULL, 5)
ON CONFLICT (code) DO NOTHING;

-- Map verification levels to allowed value tiers
DO $$
DECLARE
  v_t1 UUID;
  v_t2 UUID;
  v_t3 UUID;
  v_t4 UUID;
  v_t5 UUID;
BEGIN
  SELECT id INTO v_t1 FROM app.value_tiers WHERE code = 'tier_lt_200';
  SELECT id INTO v_t2 FROM app.value_tiers WHERE code = 'tier_200_500';
  SELECT id INTO v_t3 FROM app.value_tiers WHERE code = 'tier_500_1000';
  SELECT id INTO v_t4 FROM app.value_tiers WHERE code = 'tier_1000_5000';
  SELECT id INTO v_t5 FROM app.value_tiers WHERE code = 'tier_gt_5000';

  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2]
  WHERE code = 'level_1_basic';

  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2, v_t3, v_t4]
  WHERE code = 'level_2_verified';

  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2, v_t3, v_t4, v_t5]
  WHERE code = 'level_3_reputation';
END $$;

-- 8. Service Actions
INSERT INTO app.service_actions (code, name_ar, icon, sort_order, config)
VALUES
  ('buy', 'شراء ودفع', 'shopping-cart', 1, '{"requires_invoice": true, "affects_goods_fee": true}'::jsonb),
  ('pick', 'استلام غرض', 'package-up', 2, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('drop', 'تسليم غرض', 'package-check', 3, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('move', 'نقل / تحميل وتفريغ', 'truck', 4, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('find', 'سؤال وبحث عن متوفر', 'search', 5, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 9. Load Sizes
INSERT INTO app.load_sizes (code, name_ar, description, rank)
VALUES
  ('small', 'حجم صغير', 'طرد صغير، مستندات، أدوية، مشتريات خفيفة', 1),
  ('medium', 'حجم متوسط', 'أكياس بقالة متعددة، كرتونة متوسطة، طرد حتى 25 كجم', 2),
  ('large', 'حجم كبير', 'أجهزة كهرومنزلية، كراتين متعددة، طرود حتى 300 كجم', 3),
  ('bulky', 'حجم ضخم / عفش', 'أثاث، بضائع ضخمة، نقل كامل، طرود تتجاوز 500 كجم', 4)
ON CONFLICT (code) DO NOTHING;

-- 10. Load Size to Vehicle Mappings
INSERT INTO app.load_size_vehicle_types (load_size_id, vehicle_type_id)
SELECT ls.id, vt.id
FROM app.load_sizes ls
CROSS JOIN app.vehicle_types vt
WHERE
  (ls.code = 'small')
  OR (ls.code = 'medium' AND vt.code IN ('motorcycle', 'tricycle', 'half_truck', 'jumbo'))
  OR (ls.code = 'large' AND vt.code IN ('tricycle', 'half_truck', 'jumbo'))
  OR (ls.code = 'bulky' AND vt.code IN ('half_truck', 'jumbo'))
ON CONFLICT DO NOTHING;

-- 11. Pricing Rules
-- Giza / Hadayek al-Ahram: 10 EGP stop fee, 35 EGP/hr wait fee, 10% goods fee
INSERT INTO app.pricing_rules (region_id, stop_fee_minor, wait_fee_per_hour_minor, goods_percent_rate, is_active)
SELECT id, 1000, 3500, 0.1000, true
FROM app.regions
WHERE code = 'hadayek_ahram'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Global fallback
INSERT INTO app.pricing_rules (region_id, stop_fee_minor, wait_fee_per_hour_minor, goods_percent_rate, is_active)
VALUES (NULL, 1000, 3500, 0.1000, true)
ON CONFLICT DO NOTHING;

-- 12. Escalation Rules
INSERT INTO app.escalation_rules (region_id, step_number, initial_radius_meters, step_radius_meters, max_radius_meters, step_timeout_seconds, max_steps)
SELECT id, 1, 2000, 1000, 7000, 45, 4
FROM app.regions
WHERE code = 'hadayek_ahram'
LIMIT 1
ON CONFLICT DO NOTHING;

-- 13. Subscription Plans (30-day trial + standard tiers)
INSERT INTO app.subscription_plans (code, name_ar, name_en, price_minor, duration_days, is_active)
VALUES
  ('trial_30d', 'فترة تجريبية مجانية (30 يوم)', 'Free 30-Day Trial', 0, 30, true),
  ('monthly_standard', 'اشتراك شهري أساسي', 'Monthly Standard', 15000, 30, true),
  ('quarterly_saver', 'اشتراك 3 شهور', 'Quarterly Saver', 40000, 90, true)
ON CONFLICT (code) DO NOTHING;
