-- ============================================================================
-- Migration: 20261004000005_orders_and_invoices.sql
-- Description: Core orders, stops, stop visits, media attachments, invoices,
--              and payment receipts with triggers enforcing business constraints.
-- Reversible: Yes
-- ============================================================================

-- 1. Default Setting for Max Tasks Per Order
INSERT INTO app.settings (key, value)
VALUES ('max_tasks_per_order', '8'::jsonb)
ON CONFLICT DO NOTHING;

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS app.orders (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES app.regions(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES app.customer_profiles(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  value_tier_id UUID REFERENCES app.value_tiers(id) ON DELETE RESTRICT,
  load_size_id UUID REFERENCES app.load_sizes(id) ON DELETE RESTRICT,
  wait_mode VARCHAR(16) NOT NULL DEFAULT 'wait' CHECK (wait_mode IN ('wait', 'notify')),
  customer_location extensions.geography(Point, 4326) NOT NULL,
  min_fare_minor BIGINT NOT NULL DEFAULT 0 CHECK (min_fare_minor >= 0),
  pricing_snapshot JSONB,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE app.orders IS 'Core order entities containing customer request parameters, spatial coordinates, and lifecycle states.';

CREATE INDEX IF NOT EXISTS idx_orders_region_id ON app.orders(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON app.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON app.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_value_tier ON app.orders(value_tier_id);
CREATE INDEX IF NOT EXISTS idx_orders_load_size ON app.orders(load_size_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_location ON app.orders USING GIST (customer_location);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON app.orders(created_at DESC);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_orders_guard_status
  BEFORE UPDATE OF status ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

-- 3. Stops Table (Individual Tasks in an Order)
CREATE TABLE IF NOT EXISTS app.stops (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  seq INT NOT NULL CHECK (seq >= 1),
  action_id UUID NOT NULL REFERENCES app.service_actions(id) ON DELETE RESTRICT,
  place_id UUID REFERENCES app.places(id) ON DELETE SET NULL,
  location extensions.geography(Point, 4326) NOT NULL,
  description TEXT,
  contact_phone VARCHAR(20),
  notes TEXT,
  expected_duration_minutes INT NOT NULL DEFAULT 0 CHECK (expected_duration_minutes >= 0),
  invoice_required BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stops_order_seq UNIQUE (order_id, seq) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE app.stops IS 'Sequential waypoint tasks that form an order cart of stops.';

CREATE INDEX IF NOT EXISTS idx_stops_order_id ON app.stops(order_id);
CREATE INDEX IF NOT EXISTS idx_stops_action_id ON app.stops(action_id);
CREATE INDEX IF NOT EXISTS idx_stops_place_id ON app.stops(place_id);
CREATE INDEX IF NOT EXISTS idx_stops_location ON app.stops USING GIST (location);

CREATE TRIGGER trg_stops_updated_at
  BEFORE UPDATE ON app.stops
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Trigger: Enforce Max Tasks per Order from settings
CREATE OR REPLACE FUNCTION app.check_max_stops_per_order()
RETURNS TRIGGER AS $$
DECLARE
  v_max_tasks INT;
  v_current_count INT;
BEGIN
  -- Read setting or fallback to default 8
  SELECT COALESCE((value->>0)::int, 8)
  INTO v_max_tasks
  FROM app.settings
  WHERE key = 'max_tasks_per_order'
  LIMIT 1;

  IF v_max_tasks IS NULL THEN
    v_max_tasks := 8;
  END IF;

  SELECT count(*)
  INTO v_current_count
  FROM app.stops
  WHERE order_id = NEW.order_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_current_count >= v_max_tasks THEN
    RAISE EXCEPTION 'Order cannot have more than % tasks (current count: %)', v_max_tasks, v_current_count
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = app, extensions, pg_temp;

REVOKE EXECUTE ON FUNCTION app.check_max_stops_per_order() FROM public, anon, authenticated;

CREATE TRIGGER trg_stops_max_limit
  BEFORE INSERT ON app.stops
  FOR EACH ROW EXECUTE FUNCTION app.check_max_stops_per_order();

-- 4. Order Media
CREATE TABLE IF NOT EXISTS app.order_media (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES app.stops(id) ON DELETE SET NULL,
  uploader_id UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  media_type VARCHAR(32) NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.order_media IS 'Uploaded photos, audio notes, and attachments associated with orders or stops.';
CREATE INDEX IF NOT EXISTS idx_order_media_order_id ON app.order_media(order_id);
CREATE INDEX IF NOT EXISTS idx_order_media_stop_id ON app.order_media(stop_id);
CREATE INDEX IF NOT EXISTS idx_order_media_uploader_id ON app.order_media(uploader_id);

-- 5. Stop Visits (Actual driver arrivals and departures for multi-visit accounting)
CREATE TABLE IF NOT EXISTS app.stop_visits (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL REFERENCES app.stops(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE RESTRICT,
  visit_seq INT NOT NULL DEFAULT 1,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  departed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.stop_visits IS 'Tracking real physical arrivals and departures by the driver for wait-time and visit-count calculation.';
CREATE INDEX IF NOT EXISTS idx_stop_visits_order_id ON app.stop_visits(order_id);
CREATE INDEX IF NOT EXISTS idx_stop_visits_stop_id ON app.stop_visits(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_visits_driver_id ON app.stop_visits(driver_id);

-- 6. Invoices (Goods purchases made by driver)
CREATE TABLE IF NOT EXISTS app.invoices (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES app.stops(id) ON DELETE SET NULL,
  invoice_number VARCHAR(128),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  photo_key TEXT,
  verified_by_customer BOOLEAN NOT NULL DEFAULT false,
  customer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.invoices IS 'Merchant invoices paid by the driver during purchase stops, subject to percentage commission calculation.';
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON app.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stop_id ON app.invoices(stop_id);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 7. Payment Receipts (Proof of cash collected between parties)
CREATE TABLE IF NOT EXISTS app.payment_receipts (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  collected_amount_minor BIGINT NOT NULL CHECK (collected_amount_minor >= 0),
  receipt_type VARCHAR(32) NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.payment_receipts IS 'Recorded cash settlements between customer and driver upon completion.';
CREATE INDEX IF NOT EXISTS idx_payment_receipts_order_id ON app.payment_receipts(order_id);

-- 8. Security: RLS & Revoke
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'orders', 'stops', 'order_media',
    'stop_visits', 'invoices', 'payment_receipts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
