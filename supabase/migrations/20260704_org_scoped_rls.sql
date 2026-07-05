-- =====================================================
-- Org-level scoping for org_admin (per docs/security_roles_protocol.md §4)
--
-- Previously "country_admin_*_own" policies grouped country_admin AND org_admin
-- together, checking only country_code — meaning an org_admin had the same
-- reach as a country_admin (entire country), not just their own organization.
-- This splits that policy in two: country_admin keeps country-wide access,
-- org_admin is newly restricted to rows matching their own org_id too.
-- =====================================================

-- ── cap_drafts ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "country_admin_cap_own" ON cap_drafts;

CREATE POLICY "country_admin_cap_own" ON cap_drafts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'country_admin'
        AND p.country_code = cap_drafts.country_code
    )
  );

CREATE POLICY "org_admin_cap_own" ON cap_drafts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'org_admin'
        AND p.country_code = cap_drafts.country_code
        AND p.org_id = cap_drafts.org_id
    )
  );

-- ── incidents ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "country_admin_incidents_own" ON incidents;
DROP POLICY IF EXISTS "viewer_incidents_read" ON incidents;

CREATE POLICY "country_admin_incidents_own" ON incidents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'country_admin'
        AND p.country_code = incidents.country_code
    )
  );

CREATE POLICY "org_admin_incidents_own" ON incidents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'org_admin'
        AND p.country_code = incidents.country_code
        AND p.org_id = incidents.org_id
    )
  );

-- Viewers created directly by a country_admin have org_id NULL (country-wide
-- read); viewers created by an org_admin have org_id set (org-scoped read).
CREATE POLICY "viewer_incidents_read" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.country_code = incidents.country_code
        AND (p.org_id IS NULL OR p.org_id = incidents.org_id)
    )
  );

-- ── drill_sessions ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "country_admin_drill_own" ON drill_sessions;

CREATE POLICY "country_admin_drill_own" ON drill_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'country_admin'
        AND p.country_code = drill_sessions.country_code
    )
  );

CREATE POLICY "org_admin_drill_own" ON drill_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'org_admin'
        AND p.country_code = drill_sessions.country_code
        AND p.org_id = drill_sessions.org_id
    )
  );
