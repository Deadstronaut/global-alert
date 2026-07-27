-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #1
--
-- Live-testing finding (Playwright UI pass): recommendation_template's
-- example placeholder syntax `{{name}}` was shown verbatim in this repo's
-- i18n hint strings (risk.cascadeRules.recommendationTemplateHint/
-- recommendationTemplatePlaceholder). vue-i18n's own message compiler uses
-- `{name}` (single braces) for interpolation and throws "Not allowed nest
-- placeholder" the moment it sees `{{` immediately followed by another `{`
-- inside a translated string — confirmed live via browser console errors
-- when the Cascade Rule Config panel rendered.
--
-- Fixed by switching the placeholder token syntax from `{{name}}` to
-- `[[name]]` everywhere it appears: this SQL function, and the i18n
-- strings (fixed alongside this migration in the same commit). Existing
-- cascade_rules rows created with the old `{{...}}` syntax in their
-- recommendation_template are NOT retroactively rewritten (none existed
-- outside this session's own now-deleted smoke-test rows), but would simply
-- render literally (no substitution) rather than error, since this
-- function's replace() calls only ever act on their own literal search
-- strings — an admin editing an old rule to the new syntax is a normal
-- content update, not a migration concern.
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
  v_text := replace(v_text, '[[affected_population]]', COALESCE(round(p_affected_population::NUMERIC)::TEXT, 'population data not available'));
  RETURN v_text;
END;
$$;
