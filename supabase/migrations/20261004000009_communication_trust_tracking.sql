-- ============================================================================
-- Migration: 20261004000009_communication_trust_tracking.sql
-- Description: In-app chat, ratings aggregate trigger, disputes and arbitration,
--              notifications, web push subscriptions, and order live tracking.
-- Reversible: Yes
-- ============================================================================

-- 1. In-App Messaging Conversations
CREATE TABLE IF NOT EXISTS app.conversations (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES app.customer_profiles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_conversation UNIQUE (order_id)
);

COMMENT ON TABLE app.conversations IS 'Order-scoped private chat channel between customer and captain.';

CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON app.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_driver_id ON app.conversations(driver_id);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 2. Chat Messages
CREATE TABLE IF NOT EXISTS app.messages (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  content TEXT,
  media_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.messages IS 'Discrete chat entries with timestamps and read confirmations.';
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON app.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON app.messages(sender_id);

-- 3. Ratings and Reviews
CREATE TABLE IF NOT EXISTS app.ratings (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  reviewee_id UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  score INT NOT NULL CHECK (score >= 1 AND score <= 5),
  tags TEXT[] DEFAULT '{}',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_reviewer_reviewee UNIQUE (order_id, reviewer_id, reviewee_id)
);

COMMENT ON TABLE app.ratings IS 'Two-way trust evaluations exchanged after trip completion.';

CREATE INDEX IF NOT EXISTS idx_ratings_reviewee ON app.ratings(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_order_id ON app.ratings(order_id);

-- Trigger: Recalculate average rating and count on profile upon new review
CREATE OR REPLACE FUNCTION app.update_profile_rating_aggregates()
RETURNS TRIGGER AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INT;
BEGIN
  -- Compute aggregates for the reviewee
  SELECT
    ROUND(COALESCE(AVG(score), 5.00)::numeric, 2),
    COUNT(*)
  INTO v_avg, v_count
  FROM app.ratings
  WHERE reviewee_id = NEW.reviewee_id;

  -- Update driver profile if reviewee is driver
  UPDATE app.driver_profiles
  SET rating_avg = v_avg,
      rating_count = v_count
  WHERE id = NEW.reviewee_id;

  -- Update customer profile if reviewee is customer
  UPDATE app.customer_profiles
  SET rating_avg = v_avg,
      rating_count = v_count
  WHERE id = NEW.reviewee_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ratings_update_aggregates
  AFTER INSERT OR UPDATE ON app.ratings
  FOR EACH ROW EXECUTE FUNCTION app.update_profile_rating_aggregates();

-- 4. Disputes and Arbitration
CREATE TABLE IF NOT EXISTS app.disputes (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  filed_by UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  reason VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'opened',
  assigned_admin_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.disputes IS 'Conflict resolution cases submitted by customer or driver for administrative review.';

CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON app.disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON app.disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_assigned_admin ON app.disputes(assigned_admin_id);

CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON app.disputes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_disputes_guard_status
  BEFORE UPDATE OF status ON app.disputes
  FOR EACH ROW EXECUTE FUNCTION app.guard_status_transition();

CREATE TABLE IF NOT EXISTS app.dispute_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES app.disputes(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  event_type VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.dispute_events IS 'Audit history of actions taken on a dispute.';
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_id ON app.dispute_events(dispute_id);

-- 5. Notifications
CREATE TABLE IF NOT EXISTS app.notifications (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(64) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.notifications IS 'Targeted user notifications regarding order status, matching offers, and alerts.';
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON app.notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON app.notifications(created_at DESC);

-- 6. Web Push Subscriptions (VAPID)
CREATE TABLE IF NOT EXISTS app.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_push_endpoint UNIQUE (user_id, endpoint)
);

COMMENT ON TABLE app.push_subscriptions IS 'Browser Web Push VAPID credentials for offline notifications.';
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON app.push_subscriptions(user_id);

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON app.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 7. Order Live Tracking Breadcrumbs
CREATE TABLE IF NOT EXISTS app.order_tracking_points (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES app.driver_profiles(id) ON DELETE CASCADE,
  location extensions.geography(Point, 4326) NOT NULL,
  speed_kmh NUMERIC(5,2),
  heading NUMERIC(5,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.order_tracking_points IS 'GPS breadcrumb points during active delivery execution.';
CREATE INDEX IF NOT EXISTS idx_tracking_order_recorded ON app.order_tracking_points(order_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_location ON app.order_tracking_points USING GIST (location);

-- 8. Security: RLS & Revoke
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'conversations', 'messages', 'ratings', 'disputes',
    'dispute_events', 'notifications', 'push_subscriptions',
    'order_tracking_points'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM public, anon, authenticated;', tbl);
  END LOOP;
END $$;
