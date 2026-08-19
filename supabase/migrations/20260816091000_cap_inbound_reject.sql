-- =====================================================
-- Spec 065 fix-up: cap-inbound-ingest could store a structurally invalid
-- payload as status='rejected' (see edge function's findStructuralIssue),
-- but there was no path at all for a human reviewer to reject a
-- well-formed-but-unwanted inbound alert (e.g. a duplicate, a hoax, an
-- out-of-scope hazard) — cap_inbound_alerts.status already allowed
-- 'rejected' and CapInboundPanel.vue already had status-rejected styling,
-- but nothing could ever set it manually. Mirrors
-- promote_cap_inbound_alert()'s own authorization shape exactly.
-- =====================================================

CREATE OR REPLACE FUNCTION reject_cap_inbound_alert(p_inbound_id UUID)
RETURNS cap_inbound_alerts
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inbound cap_inbound_alerts%ROWTYPE;
  v_result cap_inbound_alerts;
BEGIN
  SELECT * INTO v_inbound FROM cap_inbound_alerts WHERE id = p_inbound_id;
  IF v_inbound.id IS NULL THEN
    RAISE EXCEPTION 'inbound alert % not found', p_inbound_id;
  END IF;

  IF NOT (
    current_profile_role() = 'super_admin'
    OR (current_profile_role() = 'country_admin' AND v_inbound.country_code = current_profile_country_code())
  ) THEN
    RAISE EXCEPTION 'not authorized to reject inbound alerts for country %', v_inbound.country_code;
  END IF;

  IF v_inbound.status = 'promoted' THEN
    RAISE EXCEPTION 'inbound alert % was already promoted, cannot reject', p_inbound_id;
  END IF;

  UPDATE cap_inbound_alerts
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = p_inbound_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_cap_inbound_alert(UUID) TO authenticated;
