-- ============================================================================
-- Rollback / Down Migration: 20261004000008_offers_and_agreements.down.sql
-- ============================================================================

DROP TRIGGER IF EXISTS trg_agreements_immutability ON app.agreements;
DROP FUNCTION IF EXISTS app.enforce_agreement_immutability() CASCADE;

DROP TABLE IF EXISTS app.agreement_amendments CASCADE;
DROP TABLE IF EXISTS app.agreements CASCADE;
DROP TABLE IF EXISTS app.offers CASCADE;
