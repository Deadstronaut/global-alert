-- =====================================================
-- Cascade Map Integration & Opt-In Auto-Evaluation (spec 049)
--
-- Two additive extensions to spec 048 (Cascading Hazard Risk):
-- (1) the map integration itself is pure frontend (ImpactPanel.vue reusing
--     CascadingRiskPanel.vue) — no schema change needed for that half.
-- (2) an opt-in, country_admin-only per-country setting that makes a new
--     AFTER INSERT trigger on each of the 9 hazard tables auto-run cascade
--     evaluation for that country. Never touches CAP/dispatch (Constitution
--     Principle II) — its only visible effect is a persisted assessment
--     (spec 048, unchanged shape) plus two new columns tracking whether it
--     was auto-triggered and whether it has been acknowledged.
-- =====================================================

-- ── country_cascade_settings ─────────────────────────────────────────────
-- Deliberate 2-tier RLS exception (super_admin + that country's
-- country_admin ONLY) — org_admin/viewer must not see or control this at
-- all (spec FR-004), unlike every other cascade-related table's usual
-- 3-tier pattern.
CREATE TABLE IF NOT EXISTS country_cascade_settings (
  country_code           VARCHAR(2) PRIMARY KEY,
  auto_evaluate_enabled   BOOLEAN NOT NULL DEFAULT false,
  updated_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE country_cascade_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_country_cascade_settings_all" ON country_cascade_settings;
CREATE POLICY "super_admin_country_cascade_settings_all" ON country_cascade_settings
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_country_cascade_settings_own" ON country_cascade_settings;
CREATE POLICY "country_admin_country_cascade_settings_own" ON country_cascade_settings
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

-- No org_admin, no viewer, no anon policy — intentional (FR-004).

DROP TRIGGER IF EXISTS audit_country_cascade_settings ON country_cascade_settings;
CREATE TRIGGER audit_country_cascade_settings
  AFTER INSERT OR UPDATE OR DELETE ON country_cascade_settings
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── cascading_risk_assessments: additive columns ─────────────────────────
ALTER TABLE cascading_risk_assessments ADD COLUMN IF NOT EXISTS triggered_automatically BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cascading_risk_assessments ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cascading_risk_assessments_unacknowledged
  ON cascading_risk_assessments (country_code, triggered_automatically, acknowledged_at)
  WHERE triggered_automatically AND acknowledged_at IS NULL;

-- ── _evaluate_cascade_rules_core: internal, no auth check ────────────────
-- Identical logic to spec 048's evaluate_cascade_rules (as it stood after
-- fix-ups #1-#7), plus stamping p_triggered_automatically onto the
-- inserted row. SECURITY DEFINER, same as before. Callers are responsible
-- for their own authorization — the public wrapper below checks for
-- interactive callers; auto_evaluate_cascade()'s authorization is
-- structural (gated entirely by country_cascade_settings, decided in
-- advance by country_admin).
CREATE OR REPLACE FUNCTION _evaluate_cascade_rules_core(
  p_country_code VARCHAR(2),
  p_hazard_type TEXT,
  p_admin_boundary_code TEXT,
  p_event_lat DOUBLE PRECISION,
  p_event_lng DOUBLE PRECISION,
  p_magnitude DOUBLE PRECISION,
  p_source_type TEXT,
  p_source_event_ref JSONB,
  p_triggered_automatically BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rule cascade_rules%ROWTYPE;
  v_triggered JSONB := '[]'::JSONB;
  v_not_evaluable JSONB := '[]'::JSONB;
  v_not_triggered_count INTEGER := 0;
  v_missing TEXT[];
  v_satisfied BOOLEAN;
  v_distance_km DOUBLE PRECISION;
  v_proximity_dataset_id UUID;
  v_radius_degrees DOUBLE PRECISION;
  v_vulnerability_score DOUBLE PRECISION;
  v_input_values JSONB;
  v_affected_population DOUBLE PRECISION;
  v_recommendation_text TEXT;
  v_assessment_id UUID;
  v_event_point geometry;
BEGIN
  IF p_source_type NOT IN ('real_event', 'hypothetical_scenario') THEN
    RAISE EXCEPTION 'source_type must be real_event or hypothetical_scenario';
  END IF;

  v_event_point := ST_SetSRID(ST_MakePoint(p_event_lng, p_event_lat), 4326);

  FOR v_rule IN
    SELECT * FROM cascade_rules
    WHERE country_code = p_country_code
      AND is_active
      AND (trigger_hazard_type = p_hazard_type OR trigger_hazard_type = 'any')
  LOOP
    v_missing := '{}';
    v_satisfied := true;
    v_distance_km := NULL;
    v_vulnerability_score := NULL;

    IF v_rule.min_magnitude IS NOT NULL THEN
      IF p_magnitude IS NULL THEN
        v_missing := array_append(v_missing, 'event has no magnitude value');
      ELSIF p_magnitude < v_rule.min_magnitude THEN
        v_satisfied := false;
      END IF;
    END IF;

    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT id INTO v_proximity_dataset_id
      FROM exposure_datasets
      WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_proximity_dataset_id IS NULL THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        v_radius_degrees := v_rule.proximity_distance_km / 90.0;

        SELECT MIN(ST_Distance(ef.geom::geography, v_event_point::geography)) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        WHERE ef.dataset_id = v_proximity_dataset_id
          AND ef.geom && ST_Expand(v_event_point, v_radius_degrees)
          AND ST_DWithin(ef.geom::geography, v_event_point::geography, v_rule.proximity_distance_km * 1000);

        IF v_distance_km IS NULL THEN
          v_satisfied := false;
        END IF;
      END IF;
    END IF;

    IF v_rule.min_vulnerability_score IS NOT NULL THEN
      v_vulnerability_score := compute_risk_category_score(p_country_code, p_admin_boundary_code, 'vulnerability');
      IF v_vulnerability_score IS NULL THEN
        v_missing := array_append(v_missing, 'no vulnerability indicators configured for this area');
      ELSIF v_vulnerability_score < v_rule.min_vulnerability_score THEN
        v_satisfied := false;
      END IF;
    END IF;

    IF array_length(v_missing, 1) IS NOT NULL THEN
      v_not_evaluable := v_not_evaluable || jsonb_build_object(
        'rule_id', v_rule.id,
        'secondary_risk_category', v_rule.secondary_risk_category,
        'missing_prerequisite', array_to_string(v_missing, '; ')
      );
    ELSIF NOT v_satisfied THEN
      v_not_triggered_count := v_not_triggered_count + 1;
    ELSE
      SELECT sums.total INTO v_affected_population
      FROM (
        SELECT SUM(ef.metric_value) AS total
        FROM exposure_datasets ed
        JOIN exposure_features ef ON ef.dataset_id = ed.id AND ef.admin_boundary_code = p_admin_boundary_code
        WHERE ed.country_code = p_country_code AND ed.metric_property_name ILIKE '%population%'
        GROUP BY ed.id, ed.created_at
        ORDER BY ed.created_at DESC
        LIMIT 1
      ) sums;

      v_input_values := jsonb_strip_nulls(jsonb_build_object(
        'magnitude', p_magnitude,
        'distance_km', v_distance_km,
        'vulnerability_score', v_vulnerability_score
      ));

      v_recommendation_text := render_recommendation_template(
        v_rule.recommendation_template, p_admin_boundary_code, p_magnitude,
        v_distance_km, v_vulnerability_score, v_affected_population
      );

      INSERT INTO cascading_risk_assessments (
        country_code, cascade_rule_id, rule_config_snapshot, source_type, source_hazard_type,
        source_event_ref, admin_boundary_code, input_values, affected_population, recommendation_text,
        triggered_automatically
      ) VALUES (
        p_country_code, v_rule.id, to_jsonb(v_rule), p_source_type, p_hazard_type,
        p_source_event_ref, p_admin_boundary_code, v_input_values, v_affected_population, v_recommendation_text,
        p_triggered_automatically
      ) RETURNING id INTO v_assessment_id;

      v_triggered := v_triggered || jsonb_build_object(
        'assessment_id', v_assessment_id,
        'rule_id', v_rule.id,
        'secondary_risk_category', v_rule.secondary_risk_category,
        'input_values', v_input_values,
        'affected_population', v_affected_population,
        'recommendation_text', v_recommendation_text
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'triggered', v_triggered,
    'not_evaluable', v_not_evaluable,
    'not_triggered_count', v_not_triggered_count
  );
END;
$$;

-- ── evaluate_cascade_rules: thin wrapper, same public contract as before ─
-- Byte-identical behavior for every existing caller (map/admin dashboard/
-- scenario builder, spec 048 FR-009): same signature, same authorization
-- check, same statement_timeout override — only the body changed to
-- delegate to _evaluate_cascade_rules_core with triggered_automatically
-- always false for this interactive entry point.
CREATE OR REPLACE FUNCTION evaluate_cascade_rules(
  p_country_code VARCHAR(2),
  p_hazard_type TEXT,
  p_admin_boundary_code TEXT,
  p_event_lat DOUBLE PRECISION,
  p_event_lng DOUBLE PRECISION,
  p_magnitude DOUBLE PRECISION,
  p_source_type TEXT,
  p_source_event_ref JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT (
    current_profile_role() = 'super_admin'
    OR (
      current_profile_role() IN ('country_admin', 'org_admin')
      AND p_country_code = current_profile_country_code()
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to evaluate cascade rules for country %', p_country_code;
  END IF;

  RETURN _evaluate_cascade_rules_core(
    p_country_code, p_hazard_type, p_admin_boundary_code, p_event_lat, p_event_lng,
    p_magnitude, p_source_type, p_source_event_ref, false
  );
END;
$$;

ALTER FUNCTION evaluate_cascade_rules(
  VARCHAR(2), TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB
) SET statement_timeout = '25s';

-- ── auto_evaluate_cascade: trigger function for the 9 hazard tables ──────
-- Near-zero cost when disabled (the common/default case): a single indexed
-- lookup, then return. Any failure past that point is swallowed (mirrors
-- spec 029's audit_log dead-letter resilience pattern) so it can never
-- block or roll back the hazard-event insert that fired it — a missed
-- automatic evaluation is always recoverable via the existing manual
-- "Evaluate Cascades" action, so no dead-letter table is needed here.
CREATE OR REPLACE FUNCTION auto_evaluate_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_enabled BOOLEAN;
  v_admin_boundary_code TEXT;
BEGIN
  SELECT auto_evaluate_enabled INTO v_enabled
  FROM country_cascade_settings
  WHERE country_code = NEW.country_code;

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Resolve admin_boundary_code from lat/lng — same country_boundaries
    -- polygon-match technique spec 039's compute_hazard_area_score already
    -- uses (ST_Within against the country's boundary features).
    SELECT feature -> 'properties' ->> cb.name_property INTO v_admin_boundary_code
    FROM country_boundaries cb,
         jsonb_array_elements(cb.geojson -> 'features') AS feature
    WHERE cb.country_code = NEW.country_code
      AND ST_Within(
        ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326)
      )
    LIMIT 1;

    IF v_admin_boundary_code IS NOT NULL THEN
      PERFORM _evaluate_cascade_rules_core(
        NEW.country_code, TG_ARGV[0], v_admin_boundary_code, NEW.lat, NEW.lng, NEW.magnitude,
        'real_event', jsonb_build_object('table', TG_TABLE_NAME, 'id', NEW.id), true
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Swallowed by design (header comment) — never block the hazard insert.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_evaluate_cascade_earthquake ON earthquake;
CREATE TRIGGER auto_evaluate_cascade_earthquake AFTER INSERT ON earthquake
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('earthquake');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_wildfire ON wildfire;
CREATE TRIGGER auto_evaluate_cascade_wildfire AFTER INSERT ON wildfire
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('wildfire');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_flood ON flood;
CREATE TRIGGER auto_evaluate_cascade_flood AFTER INSERT ON flood
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('flood');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_drought ON drought;
CREATE TRIGGER auto_evaluate_cascade_drought AFTER INSERT ON drought
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('drought');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_tsunami ON tsunami;
CREATE TRIGGER auto_evaluate_cascade_tsunami AFTER INSERT ON tsunami
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('tsunami');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_cyclone ON cyclone;
CREATE TRIGGER auto_evaluate_cascade_cyclone AFTER INSERT ON cyclone
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('cyclone');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_volcano ON volcano;
CREATE TRIGGER auto_evaluate_cascade_volcano AFTER INSERT ON volcano
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('volcano');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_epidemic ON epidemic;
CREATE TRIGGER auto_evaluate_cascade_epidemic AFTER INSERT ON epidemic
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('epidemic');

DROP TRIGGER IF EXISTS auto_evaluate_cascade_disaster ON disaster;
CREATE TRIGGER auto_evaluate_cascade_disaster AFTER INSERT ON disaster
  FOR EACH ROW EXECUTE FUNCTION auto_evaluate_cascade('disaster');

-- ── save_country_cascade_setting: upsert, relies on table RLS ────────────
CREATE OR REPLACE FUNCTION save_country_cascade_setting(
  p_country_code VARCHAR(2),
  p_enabled BOOLEAN
)
RETURNS country_cascade_settings
LANGUAGE plpgsql AS $$
DECLARE
  v_result country_cascade_settings;
BEGIN
  INSERT INTO country_cascade_settings (country_code, auto_evaluate_enabled, updated_by, updated_at)
  VALUES (p_country_code, p_enabled, auth.uid(), NOW())
  ON CONFLICT (country_code) DO UPDATE
    SET auto_evaluate_enabled = p_enabled, updated_by = auth.uid(), updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ── acknowledge_cascade_assessment: idempotent ────────────────────────────
CREATE OR REPLACE FUNCTION acknowledge_cascade_assessment(
  p_assessment_id UUID
)
RETURNS cascading_risk_assessments
LANGUAGE plpgsql AS $$
DECLARE
  v_result cascading_risk_assessments;
BEGIN
  UPDATE cascading_risk_assessments
  SET acknowledged_at = COALESCE(acknowledged_at, NOW())
  WHERE id = p_assessment_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
