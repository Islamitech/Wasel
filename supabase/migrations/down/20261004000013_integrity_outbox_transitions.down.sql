-- Down migration for 20261004000013_integrity_outbox_transitions.sql

DELETE FROM app.settings WHERE key IN ('order_ttl_minutes', 'offer_ttl_minutes', 'outbox_max_attempts', 'outbox_retention_days');

DROP TRIGGER IF EXISTS trg_offers_guard_status ON app.offers;
DELETE FROM app.status_transitions WHERE entity = 'offers';

DROP INDEX IF EXISTS app.idx_outbox_poll;
ALTER TABLE app.outbox DROP CONSTRAINT IF EXISTS chk_outbox_status;
ALTER TABLE app.outbox
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS locked_at;
