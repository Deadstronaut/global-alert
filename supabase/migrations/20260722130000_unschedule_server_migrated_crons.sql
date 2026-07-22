-- =====================================================
-- Unschedules pg_cron jobs for sources fully moved to the always-on
-- server/ aggregator on 2026-07-22 (GDACS/WHO/PTWC — see this session's
-- architecture-review discussion). Keeps the trigger_* functions defined
-- (cheap, harmless, matches this migration's own comment-not-delete
-- rollback convention) — only the schedules are removed, so calling
-- these functions again after CREATE-ing a new cron.schedule entry works
-- unchanged if this ever needs to be rolled back.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-ptwc-tsunamis') THEN
    PERFORM cron.unschedule('fetch-ptwc-tsunamis');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-who-epidemics') THEN
    PERFORM cron.unschedule('fetch-who-epidemics');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-gdacs-earthquakes') THEN
    PERFORM cron.unschedule('fetch-gdacs-earthquakes');
  END IF;
END;
$$;
