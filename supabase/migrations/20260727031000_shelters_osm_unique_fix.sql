-- =====================================================
-- Fix: 20260727030000's partial unique index (WHERE external_id IS NOT NULL)
-- is not usable as a PostgREST upsert ON CONFLICT target — Postgres requires
-- the ON CONFLICT clause's predicate to match the index's WHERE clause
-- exactly, and PostgREST's generic upsert (`Prefer: resolution=merge-
-- duplicates`) has no way to add one. Live-verified: import-osm-shelters.ts's
-- first real run failed with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Fix: a plain (non-partial) UNIQUE constraint instead. This still doesn't
-- block multiple manual rows with external_id=NULL — standard SQL treats
-- every NULL as distinct from every other NULL for uniqueness purposes, so
-- the partial WHERE clause was never actually necessary for that guarantee.
-- =====================================================

DROP INDEX IF EXISTS idx_shelters_source_external_id;

ALTER TABLE shelters ADD CONSTRAINT shelters_source_external_id_key UNIQUE (source, external_id);
