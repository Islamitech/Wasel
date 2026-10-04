-- ============================================================================
-- Migration: 20261004000012_driver_locations.sql
-- Description: Driver GPS telemetry breadcrumbs table with PostGIS GiST index
-- Reversible: Yes
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.driver_locations (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  location extensions.geography(Point, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.driver_locations IS 'GPS telemetry points reported by active drivers for spatial search and auditing.';

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON app.driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON app.driver_locations(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_gis ON app.driver_locations USING GIST (location);

ALTER TABLE app.driver_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.driver_locations FROM public, anon, authenticated;
