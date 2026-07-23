-- =====================================================
-- Deactivates 4 orphaned legacy GDACS data_sources rows.
--
-- Found auditing the admin Sources tab (2026-07-23): GDACS has FIVE rows —
--   ('GDACS', 'multi_hazard', source_type='gdacs_rest')   <- real, live, polled by server/
--   ('GDACS RSS', 'multi_hazard', source_type='gdacs_rss') <- real, live, polled by server/
--   ('GDACS', 'drought', source_type=NULL)   <- orphaned, nothing polls this
--   ('GDACS', 'earthquake', source_type=NULL) <- orphaned, nothing polls this
--   ('GDACS', 'flood', source_type=NULL)      <- orphaned, nothing polls this
--   ('GDACS', 'wildfire', source_type=NULL)   <- orphaned, nothing polls this
-- The 4 per-hazard-type rows predate the 2026-07-22 consolidation onto the
-- two multi_hazard rows (server/'s gdacsSplit() already fans one GDACS feed
-- out into all its hazard types from those two rows — see
-- configuredSources.js/registry.js). They have source_type=NULL (so
-- configuredSources.js's `.not('source_type','is',null)` filter skips
-- them) AND no endpoint_config.field_map (so dynamicSources.js's
-- isGenericSource() also skips them) — genuinely nothing in this codebase
-- writes to them anymore. The 'earthquake' one specifically also had a
-- pg_cron trigger (fetch-gdacs-earthquakes, 20260722120000) calling
-- fetch-earthquakes — but that Edge Function's GDACS branch (and every
-- other source in it) was commented out during today's cutover, so that
-- cron job has been calling a function that returns an empty array on
-- every invocation; unscheduled here too, same reasoning as
-- 20260722190000's geotiff-function cleanup.
--
-- Deactivated (is_active=false), not deleted — data_sources.id is
-- referenced by rejected_payloads/source_state_transitions (ON DELETE
-- CASCADE/SET NULL), and these rows may carry real history from before
-- the 2026-07-22 consolidation. Matches this repo's "don't destroy
-- history, make it inert" convention.
-- =====================================================

-- health_state must go to 'disabled' in the same statement — data_sources'
-- own chk_disabled_matches_active CHECK constraint requires is_active=false
-- to always pair with health_state='disabled'.
UPDATE data_sources
SET is_active = false, health_state = 'disabled'
WHERE name = 'GDACS'
  AND source_type IS NULL
  AND hazard_type IN ('drought', 'earthquake', 'flood', 'wildfire');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-gdacs-earthquakes') THEN
    PERFORM cron.unschedule('fetch-gdacs-earthquakes');
  END IF;
END;
$$;
