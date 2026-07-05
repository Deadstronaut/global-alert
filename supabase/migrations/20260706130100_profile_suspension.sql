-- =====================================================
-- Real account suspension, distinct from role downgrade (spec 004, gap 3)
--
-- revokeAccess() today only downgrades role to 'viewer' — the account can
-- still log in and use the system as a Viewer. This adds a genuine
-- active/suspended flag and wires it into current_profile_role() so that
-- every existing role-scoped RLS policy across the app (cap_drafts,
-- incidents, drill_sessions, data_sources, source_state_transitions,
-- rejected_payloads, and profiles itself) automatically stops matching for a
-- suspended user on their very next request — no per-table policy edits
-- needed elsewhere (research.md §3).
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION current_profile_role() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN is_active THEN role ELSE NULL END FROM profiles WHERE id = auth.uid()
$$;
