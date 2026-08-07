-- forecast_snapshots retention (spec 055 FR-012) — same reasoning and shape
-- as enforce_overlay_snapshot_retention() (20260805130000_overlay_snapshot_retention.sql),
-- but a 90-day window instead of 7: this is lower-cadence forecast data
-- intended to support later forecast-verification/accuracy analysis, not
-- disposable nowcast cache, per the user's explicit FR-012 decision.

CREATE OR REPLACE FUNCTION enforce_forecast_snapshot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  retention_days CONSTANT INTEGER := 90;
BEGIN
  -- Always keep the most recent cycle's full step set per variable
  -- regardless of age — same "never end up with zero snapshots just
  -- because the importer has been down" guarantee as flow/overlay
  -- snapshots' retention jobs. "Most recent cycle" = max(issued_at) per
  -- variable, not max(id), since a cycle writes several rows (one per
  -- forecast_step_hours) that must be preserved together.
  DELETE FROM storage.objects
  WHERE bucket_id = 'forecast-snapshots'
    AND name IN (
      SELECT texture_storage_path FROM forecast_snapshots fs
      WHERE fs.issued_at < NOW() - (retention_days || ' days')::INTERVAL
        AND fs.issued_at < (
          SELECT MAX(issued_at) FROM forecast_snapshots WHERE variable = fs.variable
        )
    );

  DELETE FROM forecast_snapshots fs
  WHERE fs.issued_at < NOW() - (retention_days || ' days')::INTERVAL
    AND fs.issued_at < (
      SELECT MAX(issued_at) FROM forecast_snapshots WHERE variable = fs.variable
    );
END;
$$;

-- Daily, 02:40 UTC — after enforce_flow_snapshot_retention (02:30) and
-- enforce_overlay_snapshot_retention (02:35) so the jobs don't overlap.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-forecast-snapshot-retention-daily') THEN
    PERFORM cron.unschedule('enforce-forecast-snapshot-retention-daily');
  END IF;

  PERFORM cron.schedule(
    'enforce-forecast-snapshot-retention-daily',
    '40 2 * * *',
    $job$SELECT enforce_forecast_snapshot_retention()$job$
  );
END;
$$;
