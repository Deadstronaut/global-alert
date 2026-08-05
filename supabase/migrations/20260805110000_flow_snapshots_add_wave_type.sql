-- flow_snapshots: add 'wave' as a third layer_type (spec 054 US1)
--
-- Waves reuses flow_snapshots' existing shape entirely (same synthetic u/v
-- vector encoding, same texture format, same read/staleness path) — see
-- specs/054-flow-visualization-modes/research.md §2 and data-model.md.
-- Only the CHECK constraint needs to change; no new columns.

ALTER TABLE flow_snapshots DROP CONSTRAINT IF EXISTS flow_snapshots_layer_type_check;
ALTER TABLE flow_snapshots ADD CONSTRAINT flow_snapshots_layer_type_check
  CHECK (layer_type IN ('wind', 'ocean_current', 'wave'));
