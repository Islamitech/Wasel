-- ============================================================================
-- Migration: 20261004000004_catalog.sql
-- Description: Value tiers, service actions, load sizes, vehicle mappings,
--              and points of interest (places) with spatial indexes and RLS.
-- Reversible: Yes
-- ============================================================================

-- 1. Value Tiers (Monetary limits in piasters minor units)
CREATE TABLE IF NOT EXISTS app.value_tiers (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  min_minor BIGINT NOT NULL CHECK (min_minor >= 0),
  max_minor BIGINT CHECK (max_minor IS NULL OR max_minor >= min_minor),
  rank INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.value_tiers IS 'Order goods value brackets governing risk assessment and driver verification level requirements.';

CREATE TRIGGER trg_value_tiers_updated_at
  BEFORE UPDATE ON app.value_tiers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed Value Tiers (1 EGP = 100 piasters)
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

  -- Level 1: orders up to 500 EGP (t1, t2)
  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2]
  WHERE code = 'level_1_basic';

  -- Level 2: orders up to 5000 EGP (t1, t2, t3, t4)
  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2, v_t3, v_t4]
  WHERE code = 'level_2_verified';

  -- Level 3: all orders unrestricted (t1, t2, t3, t4, t5)
  UPDATE app.verification_levels
  SET allowed_value_tier_ids = ARRAY[v_t1, v_t2, v_t3, v_t4, v_t5]
  WHERE code = 'level_3_reputation';
END $$;

-- 2. Service Actions
CREATE TABLE IF NOT EXISTS app.service_actions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  icon VARCHAR(64),
  sort_order INT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.service_actions IS 'Discrete tasks performable at an order stop (buy, pick, drop, move, find). Data-driven extensible.';

CREATE TRIGGER trg_service_actions_updated_at
  BEFORE UPDATE ON app.service_actions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed Service Actions
INSERT INTO app.service_actions (code, name_ar, icon, sort_order, config)
VALUES
  ('buy', 'شراء ودفع', 'shopping-cart', 1, '{"requires_invoice": true, "affects_goods_fee": true}'::jsonb),
  ('pick', 'استلام غرض', 'package-up', 2, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('drop', 'تسليم غرض', 'package-check', 3, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('move', 'نقل / تحميل وتفريغ', 'truck', 4, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb),
  ('find', 'سؤال وبحث عن متوفر', 'search', 5, '{"requires_invoice": false, "affects_goods_fee": false}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 3. Load Sizes
CREATE TABLE IF NOT EXISTS app.load_sizes (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  description TEXT,
  rank INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.load_sizes IS 'Classification of order physical cargo volume/weight.';

CREATE TRIGGER trg_load_sizes_updated_at
  BEFORE UPDATE ON app.load_sizes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

INSERT INTO app.load_sizes (code, name_ar, description, rank)
VALUES
  ('small', 'حجم صغير', 'طرد صغير، مستندات، أدوية، مشتريات خفيفة', 1),
  ('medium', 'حجم متوسط', 'أكياس بقالة متعددة، كرتونة متوسطة، طرد حتى 25 كجم', 2),
  ('large', 'حجم كبير', 'أجهزة كهرومنزلية، كراتين متعددة، طرود حتى 300 كجم', 3),
  ('bulky', 'حجم ضخم / عفش', 'أثاث، بضائع ضخمة، نقل كامل، طرود تتجاوز 500 كجم', 4)
ON CONFLICT (code) DO NOTHING;

-- 4. Load Size to Vehicle Types Mapping
CREATE TABLE IF NOT EXISTS app.load_size_vehicle_types (
  load_size_id UUID NOT NULL REFERENCES app.load_sizes(id) ON DELETE CASCADE,
  vehicle_type_id UUID NOT NULL REFERENCES app.vehicle_types(id) ON DELETE CASCADE,
  PRIMARY KEY (load_size_id, vehicle_type_id)
);

COMMENT ON TABLE app.load_size_vehicle_types IS 'Allowable vehicle types capable of transporting a given load size.';

-- Seed Load Size to Vehicle Mappings
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

-- 5. Places (Points of Interest / Catalog Locations)
CREATE TABLE IF NOT EXISTS app.places (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  region_id UUID REFERENCES app.regions(id) ON DELETE SET NULL,
  source VARCHAR(32) NOT NULL CHECK (source IN ('google', 'driver', 'admin', 'custom')),
  external_ref VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  location extensions.geography(Point, 4326) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.places IS 'Known commercial and residential locations in the operating area for map search and autocomplete.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_places_source_ref ON app.places(source, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_places_region_id ON app.places(region_id);
CREATE INDEX IF NOT EXISTS idx_places_location ON app.places USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_places_name_trgm ON app.places USING GIN (name extensions.gin_trgm_ops);

CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON app.places
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 6. Security: RLS & Revoke
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'value_tiers', 'service_actions', 'load_sizes',
    'load_size_vehicle_types', 'places'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
