-- =====================================================
-- Cascading Hazard Risk (spec 048)
--
-- Follow-on to spec 039 (Risk & Scenario Modeling). Where spec 039 computes a
-- single-hazard-type composite risk score per area, this module answers a
-- different question: given a primary hazard event (real or hypothetical),
-- which OTHER risks does it elevate in the same area, and why? Mechanism is
-- a country-scoped, admin-configurable cascade_rules registry evaluated by
-- evaluate_cascade_rules(). No AI/ML/LLM anywhere in this path (FR-005) —
-- identical rationale to spec 039's FR-005/FR-015: this feeds life-safety
-- recommendations and must remain traceable to a documented rule and its
-- specific configured thresholds.
--
-- Additive only: risk_indicators/risk_area_scores/hazard_scenarios/
-- hazard_event_history_view (spec 039) and exposure_datasets/exposure_features
-- (spec 008/034/038/041) are untouched.
-- =====================================================

-- ── cascade_rules ─────────────────────────────────────────────────────────
-- Admin-configured, country-scoped. All non-NULL condition columns on a row
-- must hold simultaneously (AND-only, research.md §5) for the rule to fire.
CREATE TABLE IF NOT EXISTS cascade_rules (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code                    VARCHAR(2) NOT NULL,
  trigger_hazard_type             TEXT NOT NULL,
  min_magnitude                   DOUBLE PRECISION,
  proximity_exposure_source_name  TEXT,
  proximity_distance_km           DOUBLE PRECISION CHECK (proximity_distance_km IS NULL OR proximity_distance_km > 0),
  min_vulnerability_score         DOUBLE PRECISION CHECK (min_vulnerability_score IS NULL OR (min_vulnerability_score >= 0 AND min_vulnerability_score <= 10)),
  secondary_risk_category         TEXT NOT NULL,
  recommendation_template         TEXT NOT NULL,
  is_active                       BOOLEAN NOT NULL DEFAULT true,
  created_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A rule with zero conditions would trivially fire on every event — never
  -- a useful or intended configuration (data-model.md §1).
  CONSTRAINT chk_cascade_rules_has_condition CHECK (
    min_magnitude IS NOT NULL
    OR proximity_exposure_source_name IS NOT NULL
    OR min_vulnerability_score IS NOT NULL
  ),
  -- Proximity fields must be both-set or both-null, never one without the other.
  CONSTRAINT chk_cascade_rules_proximity_paired CHECK (
    (proximity_exposure_source_name IS NULL AND proximity_distance_km IS NULL)
    OR (proximity_exposure_source_name IS NOT NULL AND proximity_distance_km IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cascade_rules_country_hazard ON cascade_rules (country_code, trigger_hazard_type);

ALTER TABLE cascade_rules ENABLE ROW LEVEL SECURITY;

-- No anon read policy: a rule's existence/threshold can itself reveal
-- something about a country's assessed vulnerabilities (same sensitivity
-- class as risk_indicators, spec 039).
DROP POLICY IF EXISTS "super_admin_cascade_rules_all" ON cascade_rules;
CREATE POLICY "super_admin_cascade_rules_all" ON cascade_rules
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_cascade_rules_own" ON cascade_rules;
CREATE POLICY "country_admin_cascade_rules_own" ON cascade_rules
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_cascade_rules_own" ON cascade_rules;
CREATE POLICY "org_admin_cascade_rules_own" ON cascade_rules
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_cascade_rules ON cascade_rules;
CREATE TRIGGER audit_cascade_rules
  AFTER INSERT OR UPDATE OR DELETE ON cascade_rules
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── cascading_risk_assessments ───────────────────────────────────────────
-- One row per rule that actually fired against one real event or
-- hypothetical scenario. Immutable once created — never updated (FR-010).
-- rule_config_snapshot (not cascade_rule_id alone) is the source of truth
-- for what the rule said at evaluation time, so a later rule edit/delete
-- cannot retroactively change what a past assessment showed.
CREATE TABLE IF NOT EXISTS cascading_risk_assessments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code           VARCHAR(2) NOT NULL,
  cascade_rule_id        UUID REFERENCES cascade_rules(id) ON DELETE SET NULL,
  rule_config_snapshot   JSONB NOT NULL,
  source_type            TEXT NOT NULL CHECK (source_type IN ('real_event', 'hypothetical_scenario')),
  source_hazard_type      TEXT NOT NULL,
  source_event_ref       JSONB NOT NULL,
  admin_boundary_code    TEXT NOT NULL,
  input_values           JSONB NOT NULL,
  affected_population    DOUBLE PRECISION,
  recommendation_text    TEXT NOT NULL,
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cascading_risk_assessments_lookup
  ON cascading_risk_assessments (country_code, admin_boundary_code, computed_at DESC);

ALTER TABLE cascading_risk_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_cascading_risk_assessments_all" ON cascading_risk_assessments;
CREATE POLICY "super_admin_cascading_risk_assessments_all" ON cascading_risk_assessments
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_cascading_risk_assessments_own" ON cascading_risk_assessments;
CREATE POLICY "country_admin_cascading_risk_assessments_own" ON cascading_risk_assessments
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_cascading_risk_assessments_own" ON cascading_risk_assessments;
CREATE POLICY "org_admin_cascading_risk_assessments_own" ON cascading_risk_assessments
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

-- ── save_cascade_rule: validate condition presence, then upsert ─────────
CREATE OR REPLACE FUNCTION save_cascade_rule(
  p_id UUID,
  p_country_code VARCHAR(2),
  p_trigger_hazard_type TEXT,
  p_min_magnitude DOUBLE PRECISION,
  p_proximity_exposure_source_name TEXT,
  p_proximity_distance_km DOUBLE PRECISION,
  p_min_vulnerability_score DOUBLE PRECISION,
  p_secondary_risk_category TEXT,
  p_recommendation_template TEXT,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS cascade_rules
LANGUAGE plpgsql AS $$
DECLARE
  v_result cascade_rules;
BEGIN
  IF p_min_magnitude IS NULL AND p_proximity_exposure_source_name IS NULL AND p_min_vulnerability_score IS NULL THEN
    RAISE EXCEPTION 'At least one condition (magnitude threshold, proximity layer, or vulnerability threshold) must be set';
  END IF;

  IF (p_proximity_exposure_source_name IS NULL) IS DISTINCT FROM (p_proximity_distance_km IS NULL) THEN
    RAISE EXCEPTION 'proximity_exposure_source_name and proximity_distance_km must both be set or both be empty';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO cascade_rules (
      country_code, trigger_hazard_type, min_magnitude, proximity_exposure_source_name,
      proximity_distance_km, min_vulnerability_score, secondary_risk_category,
      recommendation_template, is_active, created_by
    ) VALUES (
      p_country_code, p_trigger_hazard_type, p_min_magnitude, p_proximity_exposure_source_name,
      p_proximity_distance_km, p_min_vulnerability_score, p_secondary_risk_category,
      p_recommendation_template, p_is_active, auth.uid()
    ) RETURNING * INTO v_result;
  ELSE
    UPDATE cascade_rules
    SET trigger_hazard_type = p_trigger_hazard_type,
        min_magnitude = p_min_magnitude,
        proximity_exposure_source_name = p_proximity_exposure_source_name,
        proximity_distance_km = p_proximity_distance_km,
        min_vulnerability_score = p_min_vulnerability_score,
        secondary_risk_category = p_secondary_risk_category,
        recommendation_template = p_recommendation_template,
        is_active = p_is_active
    WHERE id = p_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

-- ── render_recommendation_template: plain placeholder substitution ──────
-- Substitution only, no conditional/scripting logic (research.md §5, FR-005
-- — this is string interpolation, never freeform generation).
CREATE OR REPLACE FUNCTION render_recommendation_template(
  p_template TEXT,
  p_admin_boundary_code TEXT,
  p_magnitude DOUBLE PRECISION,
  p_distance_km DOUBLE PRECISION,
  p_vulnerability_score DOUBLE PRECISION,
  p_affected_population DOUBLE PRECISION
)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_text TEXT := p_template;
BEGIN
  v_text := replace(v_text, '{{area}}', p_admin_boundary_code);
  v_text := replace(v_text, '{{magnitude}}', COALESCE(p_magnitude::TEXT, 'n/a'));
  v_text := replace(v_text, '{{distance_km}}', COALESCE(round(p_distance_km::NUMERIC, 1)::TEXT, 'n/a'));
  v_text := replace(v_text, '{{vulnerability_score}}', COALESCE(round(p_vulnerability_score::NUMERIC, 1)::TEXT, 'n/a'));
  v_text := replace(v_text, '{{affected_population}}', COALESCE(round(p_affected_population::NUMERIC)::TEXT, 'population data not available'));
  RETURN v_text;
END;
$$;

-- ── evaluate_cascade_rules: the core evaluation ──────────────────────────
-- Loads active rules matching trigger_hazard_type = p_hazard_type OR 'any';
-- for each, evaluates every configured condition. A rule is:
--   - triggered: every configured condition satisfied (assessment inserted)
--   - not_evaluable: at least one condition's required data is unavailable
--     (missing exposure layer, no vulnerability indicators, event has no
--     magnitude) — the specific missing prerequisite is named (FR-006)
--   - not_triggered: every condition was evaluable but at least one was not
--     satisfied (the ordinary "rule didn't fire" case, FR-007)
-- These three outcomes are never conflated.
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
LANGUAGE plpgsql AS $$
DECLARE
  v_rule cascade_rules%ROWTYPE;
  v_triggered JSONB := '[]'::JSONB;
  v_not_evaluable JSONB := '[]'::JSONB;
  v_not_triggered_count INTEGER := 0;
  v_missing TEXT[];
  v_satisfied BOOLEAN;
  v_distance_km DOUBLE PRECISION;
  v_layer_exists BOOLEAN;
  v_vulnerability_score DOUBLE PRECISION;
  v_input_values JSONB;
  v_affected_population DOUBLE PRECISION;
  v_recommendation_text TEXT;
  v_assessment_id UUID;
BEGIN
  IF p_source_type NOT IN ('real_event', 'hypothetical_scenario') THEN
    RAISE EXCEPTION 'source_type must be real_event or hypothetical_scenario';
  END IF;

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

    -- Magnitude condition
    IF v_rule.min_magnitude IS NOT NULL THEN
      IF p_magnitude IS NULL THEN
        v_missing := array_append(v_missing, 'event has no magnitude value');
      ELSIF p_magnitude < v_rule.min_magnitude THEN
        v_satisfied := false;
      END IF;
    END IF;

    -- Proximity condition
    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM exposure_datasets
        WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ) INTO v_layer_exists;

      IF NOT v_layer_exists THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        SELECT MIN(ST_Distance(
          ef.geom::geography,
          ST_SetSRID(ST_MakePoint(p_event_lng, p_event_lat), 4326)::geography
        )) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        JOIN exposure_datasets ed ON ed.id = ef.dataset_id
        WHERE ed.country_code = p_country_code AND ed.source_name = v_rule.proximity_exposure_source_name;

        IF v_distance_km IS NULL OR v_distance_km > v_rule.proximity_distance_km THEN
          v_satisfied := false;
        END IF;
      END IF;
    END IF;

    -- Vulnerability condition (reuses spec 039's compute_risk_category_score, research.md §2)
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
      -- Every configured condition satisfied: compute affected population
      -- (most-recently-added population-like exposure dataset for this
      -- area, to avoid double-counting if multiple population sources
      -- exist for the same country) and render the recommendation text.
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
        source_event_ref, admin_boundary_code, input_values, affected_population, recommendation_text
      ) VALUES (
        p_country_code, v_rule.id, to_jsonb(v_rule), p_source_type, p_hazard_type,
        p_source_event_ref, p_admin_boundary_code, v_input_values, v_affected_population, v_recommendation_text
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
