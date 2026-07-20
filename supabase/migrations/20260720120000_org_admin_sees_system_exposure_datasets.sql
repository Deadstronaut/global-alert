-- =====================================================
-- Fix: org_admin couldn't see system-imported exposure datasets
--
-- exposure_datasets rows created by the automated Kontur/WorldPop/OSM/
-- HydroRIVERS/HydroBASINS imports (spec 038) are country-wide and have
-- org_id = NULL (nobody's org — same convention as viewer_incidents_read
-- in 20260704120200_org_scoped_rls.sql). The org_admin policy from
-- 20260706170000_impact_analysis.sql required an exact org_id match,
-- which a NULL org_id can never satisfy — so org_admins could never see
-- (or select for scenario simulation) any auto-imported population/
-- exposure dataset, only ones their own org had uploaded.
--
-- Fix: org_admin gets SELECT on their country's system-wide (org_id IS
-- NULL) datasets in addition to their own org's, but write access
-- (INSERT/UPDATE/DELETE) stays restricted to their own org's rows only —
-- org_admins still can't modify or delete the shared system datasets.
-- =====================================================

DROP POLICY IF EXISTS "org_admin_exposure_datasets_own" ON exposure_datasets;

CREATE POLICY "org_admin_exposure_datasets_select" ON exposure_datasets
  FOR SELECT USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND (org_id IS NULL OR org_id = current_profile_org_id())
  );

CREATE POLICY "org_admin_exposure_datasets_write" ON exposure_datasets
  FOR INSERT WITH CHECK (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

CREATE POLICY "org_admin_exposure_datasets_update" ON exposure_datasets
  FOR UPDATE USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

CREATE POLICY "org_admin_exposure_datasets_delete" ON exposure_datasets
  FOR DELETE USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

-- exposure_features RLS piggybacks on exposure_datasets visibility (see
-- "exposure_features_visible_with_dataset" in 20260706170000_impact_analysis.sql)
-- via an org_admin branch that has the same NULL-org_id gap — fix it too so
-- zonal-stat computation and any client-side feature reads work consistently.
DROP POLICY IF EXISTS "exposure_features_visible_with_dataset" ON exposure_features;
CREATE POLICY "exposure_features_visible_with_dataset" ON exposure_features
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM exposure_datasets d
      WHERE d.id = exposure_features.dataset_id
        AND (
          current_profile_role() = 'super_admin'
          OR (current_profile_role() = 'country_admin' AND d.country_code = current_profile_country_code())
          OR (
            current_profile_role() = 'org_admin'
            AND d.country_code = current_profile_country_code()
            AND (d.org_id IS NULL OR d.org_id = current_profile_org_id())
          )
        )
    )
  );
