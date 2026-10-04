-- ============================================================================
-- Rollback / Down Migration: 20261004000005_orders_and_invoices.down.sql
-- ============================================================================

DROP TRIGGER IF EXISTS trg_stops_max_limit ON app.stops;
DROP FUNCTION IF EXISTS app.check_max_stops_per_order() CASCADE;

DROP TABLE IF EXISTS app.payment_receipts CASCADE;
DROP TABLE IF EXISTS app.invoices CASCADE;
DROP TABLE IF EXISTS app.stop_visits CASCADE;
DROP TABLE IF EXISTS app.order_media CASCADE;
DROP TABLE IF EXISTS app.stops CASCADE;
DROP TABLE IF EXISTS app.orders CASCADE;
