-- forecast_outlooks retention (spec 055 FR-012) — same 90-day reasoning as
-- enforce_forecast_snapshot_retention (20260806162000_forecast_snapshots_retention.sql),
-- keyed per (horizon, region_code, variable) instead of per variable, since
-- that's this table's natural "one current row" grouping.

CREATE OR REPLACE FUNCTION enforce_forecast_outlook_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  retention_days CONSTANT INTEGER := 90;
BEGIN
  DELETE FROM forecast_outlooks fo
  WHERE fo.issued_at < NOW() - (retention_days || ' days')::INTERVAL
    AND fo.id NOT IN (
      SELECT DISTINCT ON (horizon, region_code, variable) id FROM forecast_outlooks
      ORDER BY horizon, region_code, variable, issued_at DESC
    );
END;
$$;

-- Daily, 02:45 UTC — after enforce_forecast_snapshot_retention's 02:40 slot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-forecast-outlook-retention-daily') THEN
    PERFORM cron.unschedule('enforce-forecast-outlook-retention-daily');
  END IF;

  PERFORM cron.schedule(
    'enforce-forecast-outlook-retention-daily',
    '45 2 * * *',
    $job$SELECT enforce_forecast_outlook_retention()$job$
  );
END;
$$;
