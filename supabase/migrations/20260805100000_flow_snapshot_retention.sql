-- flow_snapshots retention (spec 053 T029)
--
-- Wind snapshots land every 6h, ocean-current every ~1 day, forever, with
-- nothing removing old ones — texture PNGs + rows accumulate unbounded in
-- both the flow_snapshots table and the flow-snapshots Storage bucket.
--
-- Deliberately NOT reusing the audit-focused retention_policies /
-- enforce_retention_policies() machinery from
-- 20260711130000_audit_compliance_gaps.sql — that system's category CHECK
-- constraint and archive-table design exists for compliance-sensitive data
-- (audit_log, dispatch_receipts) that needs an admin-configurable trail.
-- flow_snapshots is disposable cache data with no compliance requirement,
-- so a plain scheduled delete is the proportionate fix here (Constitution
-- Principle VIII: don't stretch a compliance-grade mechanism to cover data
-- that was never meant to be archived).

CREATE OR REPLACE FUNCTION enforce_flow_snapshot_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  retention_days CONSTANT INTEGER := 7;
BEGIN
  -- Always keep the most recent row per layer_type regardless of age — a
  -- toggled-on wind/currents layer should never end up with zero snapshots
  -- just because the importer has been down longer than the retention
  -- window.
  DELETE FROM storage.objects
  WHERE bucket_id = 'flow-snapshots'
    AND name IN (
      SELECT texture_storage_path FROM flow_snapshots fs
      WHERE fs.issued_at < NOW() - (retention_days || ' days')::INTERVAL
        AND fs.id NOT IN (
          SELECT DISTINCT ON (layer_type) id FROM flow_snapshots ORDER BY layer_type, issued_at DESC
        )
    );

  DELETE FROM flow_snapshots fs
  WHERE fs.issued_at < NOW() - (retention_days || ' days')::INTERVAL
    AND fs.id NOT IN (
      SELECT DISTINCT ON (layer_type) id FROM flow_snapshots ORDER BY layer_type, issued_at DESC
    );
END;
$$;

-- Daily, 02:30 UTC — just after enforce_retention_policies' own 02:00 slot
-- (20260711130000_audit_compliance_gaps.sql) so the two jobs don't overlap.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enforce-flow-snapshot-retention-daily') THEN
    PERFORM cron.unschedule('enforce-flow-snapshot-retention-daily');
  END IF;

  PERFORM cron.schedule(
    'enforce-flow-snapshot-retention-daily',
    '30 2 * * *',
    $job$SELECT enforce_flow_snapshot_retention()$job$
  );
END;
$$;
