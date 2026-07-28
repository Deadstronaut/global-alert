-- =====================================================
-- render_recommendation_template — thousands-separated affected_population
--
-- User-reported: the recommendation_text's baked-in [[affected_population]]
-- number rendered as a plain unformatted digit string ("16666826"), even
-- after the frontend-side population/count formatting pass (ImpactPanel/
-- CascadingRiskPanel/etc.) added toLocaleString() everywhere else — this one
-- is server-rendered plain text stored in cascading_risk_assessments, not a
-- number a Vue template can reformat client-side. Uses to_char's grouping
-- then swaps the comma for a dot explicitly (not relying on the database's
-- locale for the grouping separator), matching the "." thousands convention
-- already used everywhere else in this app's UI.
--
-- Only affects assessments evaluated after this migration — existing rows'
-- already-rendered recommendation_text is not retroactively rewritten,
-- same convention as the earlier [[placeholder]] syntax fix.
-- =====================================================

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
  v_text := replace(v_text, '[[area]]', p_admin_boundary_code);
  v_text := replace(v_text, '[[magnitude]]', COALESCE(p_magnitude::TEXT, 'n/a'));
  v_text := replace(v_text, '[[distance_km]]', COALESCE(round(p_distance_km::NUMERIC, 1)::TEXT, 'n/a'));
  v_text := replace(v_text, '[[vulnerability_score]]', COALESCE(round(p_vulnerability_score::NUMERIC, 1)::TEXT, 'n/a'));
  v_text := replace(v_text, '[[affected_population]]', COALESCE(
    replace(to_char(round(p_affected_population::NUMERIC), 'FM999G999G999G999'), ',', '.'),
    'population data not available'
  ));
  RETURN v_text;
END;
$$;
