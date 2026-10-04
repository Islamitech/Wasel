-- ============================================================================
-- Rollback / Down Migration: 20261004000009_communication_trust_tracking.down.sql
-- ============================================================================

DROP TRIGGER IF EXISTS trg_ratings_update_aggregates ON app.ratings;
DROP FUNCTION IF EXISTS app.update_profile_rating_aggregates() CASCADE;

DROP TABLE IF EXISTS app.order_tracking_points CASCADE;
DROP TABLE IF EXISTS app.push_subscriptions CASCADE;
DROP TABLE IF EXISTS app.notifications CASCADE;
DROP TABLE IF EXISTS app.dispute_events CASCADE;
DROP TABLE IF EXISTS app.disputes CASCADE;
DROP TABLE IF EXISTS app.ratings CASCADE;
DROP TABLE IF EXISTS app.messages CASCADE;
DROP TABLE IF EXISTS app.conversations CASCADE;
