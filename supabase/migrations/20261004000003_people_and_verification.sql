-- ============================================================================
-- Migration: 20261004000003_people_and_verification.sql
-- Description: Customer profiles, driver profiles, verification levels & documents,
--              vehicle types and driver vehicles with spatial indexes and RLS.
-- Reversible: Yes
-- ============================================================================

-- 1. Verification Levels
CREATE TABLE IF NOT EXISTS app.verification_levels (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  rank INT NOT NULL,
  name_ar VARCHAR(128) NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}',
  allowed_value_tier_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.verification_levels IS 'Driver trust tiers gating eligible order monetary value tiers.';

CREATE TRIGGER trg_verification_levels_updated_at
  BEFORE UPDATE ON app.verification_levels
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed 3 Levels
INSERT INTO app.verification_levels (code, rank, name_ar, rules)
VALUES
  ('level_1_basic', 1, 'المستوى الأساسي (بطاقة ورخصة ومركبة)', '{"required_docs": ["national_id_front", "national_id_back", "driver_license", "vehicle_license"]}'::jsonb),
  ('level_2_verified', 2, 'المستوى الموثق (فيش وتشبيه جنائي سليم)', '{"required_docs": ["criminal_record"]}'::jsonb),
  ('level_3_reputation', 3, 'المستوى الذهبي (سمعة وتقييمات استثنائية)', '{"min_rating": 4.8, "min_trips": 100}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 2. Customer Profiles
CREATE TABLE IF NOT EXISTS app.customer_profiles (
  id UUID PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  region_id UUID REFERENCES app.regions(id) ON DELETE SET NULL,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating_avg >= 1.00 AND rating_avg <= 5.00),
  rating_count INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  completed_count INT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.customer_profiles IS 'Customer profile metadata, performance aggregates and preferred region.';
CREATE INDEX IF NOT EXISTS idx_customer_profiles_region_id ON app.customer_profiles(region_id);

CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON app.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 3. Vehicle Types (Approved fleet: bicycle, motorcycle, tricycle, half-truck, jumbo)
CREATE TABLE IF NOT EXISTS app.vehicle_types (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  name_ar VARCHAR(128) NOT NULL,
  max_weight_kg INT NOT NULL,
  max_volume_m3 NUMERIC(5,2) NOT NULL,
  dimensions JSONB,
  escalation_rank INT NOT NULL,
  icon VARCHAR(64),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.vehicle_types IS 'Catalog of supported vehicle categories for dispatch and load matching.';

CREATE TRIGGER trg_vehicle_types_updated_at
  BEFORE UPDATE ON app.vehicle_types
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Seed vehicle types
INSERT INTO app.vehicle_types (code, name_ar, max_weight_kg, max_volume_m3, escalation_rank, icon)
VALUES
  ('bicycle', 'دراجة هوائية', 15, 0.05, 1, 'bike'),
  ('motorcycle', 'دراجة نارية (موتوسيكل)', 40, 0.15, 2, 'motorcycle'),
  ('tricycle', 'تروسيكل', 400, 1.50, 3, 'tricycle'),
  ('half_truck', 'نصف نقل (بيك آب)', 1200, 5.00, 4, 'truck-pickup'),
  ('jumbo', 'جامبو (نقل خفيف)', 3500, 15.00, 5, 'truck')
ON CONFLICT (code) DO NOTHING;

-- 4. Driver Profiles (Termed "Captain" in UI)
CREATE TABLE IF NOT EXISTS app.driver_profiles (
  id UUID PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  region_id UUID REFERENCES app.regions(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  verification_level_id UUID REFERENCES app.verification_levels(id) ON DELETE SET NULL,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating_avg >= 1.00 AND rating_avg <= 5.00),
  rating_count INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  completed_count INT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_location extensions.geography(Point, 4326),
  last_seen_at TIMESTAMPTZ,
  acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (acceptance_rate >= 0.00 AND acceptance_rate <= 100.00),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.driver_profiles IS 'Driver (Captain) operational state, location, verification tier, and rating aggregates.';

CREATE INDEX IF NOT EXISTS idx_driver_profiles_region_id ON app.driver_profiles(region_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_verification_level ON app.driver_profiles(verification_level_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_status ON app.driver_profiles(status);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_active_online ON app.driver_profiles(is_online, status) WHERE is_online = true AND status = 'approved';

-- GiST spatial index for radius searching
CREATE INDEX IF NOT EXISTS idx_driver_profiles_last_location ON app.driver_profiles USING GIST (last_location);

CREATE TRIGGER trg_driver_profiles_updated_at
  BEFORE UPDATE ON app.driver_profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_driver_profiles_guard_status
  BEFORE UPDATE OF status ON app.driver_profiles
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

-- 5. Vehicles (Assigned to Drivers)
CREATE TABLE IF NOT EXISTS app.vehicles (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  vehicle_type_id UUID NOT NULL REFERENCES app.vehicle_types(id) ON DELETE RESTRICT,
  plate VARCHAR(64),
  photo_key TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.vehicles IS 'Physical transport assets linked to drivers.';
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON app.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_type_id ON app.vehicles(vehicle_type_id);

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON app.vehicles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 6. Verification Documents
CREATE TABLE IF NOT EXISTS app.verification_documents (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  storage_key TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  encrypted_metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.verification_documents IS 'Confidential identity, background, and vehicle documents submitted for approval.';
CREATE INDEX IF NOT EXISTS idx_verification_docs_driver_id ON app.verification_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_verification_docs_status ON app.verification_documents(status);
CREATE INDEX IF NOT EXISTS idx_verification_docs_reviewed_by ON app.verification_documents(reviewed_by);

CREATE TRIGGER trg_verification_documents_updated_at
  BEFORE UPDATE ON app.verification_documents
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 7. Security: RLS & Revoke
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'verification_levels', 'customer_profiles', 'vehicle_types',
    'driver_profiles', 'vehicles', 'verification_documents'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
