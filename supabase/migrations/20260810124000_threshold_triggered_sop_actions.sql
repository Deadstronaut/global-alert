-- =====================================================
-- Threshold-Triggered SOP Actions (spec 061)
--
-- MHEWS gap: no "anticipatory action" link exists between a fired cascade
-- rule (spec 048/049 — a hazard crossing an admin-configured threshold) and
-- the SOP repository (spec 010/033) that documents what to actually do
-- about it. This links a cascade_rules row to one sop_documents row and
-- copies that link onto every cascading_risk_assessments row it produces,
-- so a triggered assessment surfaces its relevant procedure directly
-- instead of requiring a separate manual lookup. Additive only:
-- auto_evaluate_cascade's already-live trigger-on-hazard-insert mechanism
-- (spec 049) is the "automatic" half of "threshold-triggered action" this
-- spec completes — nothing about firing conditions changes here.
-- =====================================================

ALTER TABLE cascade_rules
  ADD COLUMN IF NOT EXISTS linked_sop_document_id UUID REFERENCES sop_documents(id) ON DELETE SET NULL;

ALTER TABLE cascading_risk_assessments
  ADD COLUMN IF NOT EXISTS sop_document_id UUID REFERENCES sop_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN cascade_rules.linked_sop_document_id IS
  'Optional SOP to surface whenever this rule fires (spec 061) — NULL is valid, a rule need not have one.';
COMMENT ON COLUMN cascading_risk_assessments.sop_document_id IS
  'Copy of the firing rule''s linked_sop_document_id at evaluation time (spec 061) — stays correct even if the rule is later edited/unlinked, matching rule_config_snapshot''s existing immutability convention.';

-- ── save_cascade_rule: same contract, new optional trailing parameter ────
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
  p_is_active BOOLEAN DEFAULT true,
  p_linked_sop_document_id UUID DEFAULT NULL
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
      recommendation_template, is_active, created_by, linked_sop_document_id
    ) VALUES (
      p_country_code, p_trigger_hazard_type, p_min_magnitude, p_proximity_exposure_source_name,
      p_proximity_distance_km, p_min_vulnerability_score, p_secondary_risk_category,
      p_recommendation_template, p_is_active, auth.uid(), p_linked_sop_document_id
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
        is_active = p_is_active,
        linked_sop_document_id = p_linked_sop_document_id
    WHERE id = p_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

-- ── _evaluate_cascade_rules_core: same logic, now copies the SOP link ───
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
  v_sop_title TEXT;
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

      v_sop_title := NULL;
      IF v_rule.linked_sop_document_id IS NOT NULL THEN
        SELECT title INTO v_sop_title FROM sop_documents WHERE id = v_rule.linked_sop_document_id;
      END IF;

      INSERT INTO cascading_risk_assessments (
        country_code, cascade_rule_id, rule_config_snapshot, source_type, source_hazard_type,
        source_event_ref, admin_boundary_code, input_values, affected_population, recommendation_text,
        triggered_automatically, sop_document_id
      ) VALUES (
        p_country_code, v_rule.id, to_jsonb(v_rule), p_source_type, p_hazard_type,
        p_source_event_ref, p_admin_boundary_code, v_input_values, v_affected_population, v_recommendation_text,
        p_triggered_automatically, v_rule.linked_sop_document_id
      ) RETURNING id INTO v_assessment_id;

      v_triggered := v_triggered || jsonb_build_object(
        'assessment_id', v_assessment_id,
        'rule_id', v_rule.id,
        'secondary_risk_category', v_rule.secondary_risk_category,
        'input_values', v_input_values,
        'affected_population', v_affected_population,
        'recommendation_text', v_recommendation_text,
        'sop_document_id', v_rule.linked_sop_document_id,
        'sop_title', v_sop_title
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
