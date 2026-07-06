-- =====================================================
-- Hazard Taxonomy Hierarchy (spec 024)
-- Covers: FR-001 through FR-005, FR-009, FR-010
--
-- Closes the last remaining "hiyerarşik hazard ilişkileri" backlog item from
-- spec 010/016/020 — adds an optional single-parent relationship to the
-- existing global hazard_types registry. Purely additive: no existing RLS
-- policy, table, or trigger is modified; the same super_admin_hazard_types_all
-- policy (and spec 018's hazard_taxonomy capability grant) already governs
-- writes to this new column since it's part of the same row.
-- =====================================================

ALTER TABLE hazard_types
  ADD COLUMN IF NOT EXISTS parent_code TEXT REFERENCES hazard_types(code) ON DELETE SET NULL;

-- ── FR-002/FR-003: reject self-reference and cycles server-side (defense in
--    depth behind the admin form's own client-side wouldCreateCycle() check,
--    same pattern as validate_hazard_breakpoints() on hazard_thresholds) ────
CREATE OR REPLACE FUNCTION prevent_hazard_type_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur TEXT;
  depth INT := 0;
BEGIN
  IF NEW.parent_code IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_code = NEW.code THEN
    RAISE EXCEPTION 'invalid_hazard_parent: a hazard type cannot be its own parent';
  END IF;

  cur := NEW.parent_code;
  WHILE cur IS NOT NULL AND depth < 10 LOOP
    IF cur = NEW.code THEN
      RAISE EXCEPTION 'invalid_hazard_parent: assigning % as parent of % would create a cycle', NEW.parent_code, NEW.code;
    END IF;
    SELECT parent_code INTO cur FROM hazard_types WHERE code = cur;
    depth := depth + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_hazard_type_cycle ON hazard_types;
CREATE TRIGGER trg_prevent_hazard_type_cycle
  BEFORE INSERT OR UPDATE OF parent_code ON hazard_types
  FOR EACH ROW EXECUTE FUNCTION prevent_hazard_type_cycle();
