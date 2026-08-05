-- overlay_snapshots retention (spec 054 T003) — same reasoning and shape
-- as enforce_flow_snapshot_retention() (20260805100000_flow_snapshot_retention.sql):
-- disposable cache data, not compliance data, so a plain scheduled delete
-- is the proportionate fix rather than reusing the audit-focused
-- retention_policies machinery.

CREATE OR REPLACE FUNCTION enforce_overlay_snapshot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  retention_days CONSTANT INTEGER := 7;
BEGIN
  -- Always keep the most recent row per overlay_type regardless of age —
  -- same "never end up with zero snapshots just because the importer has
  -- been down" guarantee as the flow_snapshots retention job.
  DELETE FROM storage.objects
  WHERE bucket_id = 'overlay-snapshots'
    AND name IN (
      SELECT texture_storage_path FROM overlay_snapshots os
      WHERE os.issued_at < NOW() - (retention_days || ' days')::INTERVAL
        AND os.id NOT IN (
          SELECT DISTINCT ON (overlay_type) id FROM overlay_snapshots ORDER BY overlay_type, issued_at DESC
        )
    );

  DELETE FROM overlay_snapshots os
  WHERE os.issued_at < NOW() - (retention_days || ' days')::INTERVAL
    AND os.id NOT IN (
      SELECT DISTINCT ON (overlay_type) id FROM overlay_snapshots ORDER BY overlay_type, issued_at DESC
    );
END;
$$;

-- Daily, 02:35 UTC — just after enforce_flow_snapshot_retention's own
-- 02:30 slot so the jobs don't overlap.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-overlay-snapshot-retention-daily') THEN
    PERFORM cron.unschedule('enforce-overlay-snapshot-retention-daily');
  END IF;

  PERFORM cron.schedule(
    'enforce-overlay-snapshot-retention-daily',
    '35 2 * * *',
    $job$SELECT enforce_overlay_snapshot_retention()$job$
  );
END;
$$;
