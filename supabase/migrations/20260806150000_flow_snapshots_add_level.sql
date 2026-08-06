-- flow_snapshots: add 'level' — spec 054 follow-up, 2026-08-06: Height
-- selector now also drives Animate: Wind, not just Overlay: Temp/RH
-- (user feedback: changing Height didn't change the animated wind
-- pattern at all before this). Same shape as overlay_snapshots' own
-- 'level' addition. Existing rows default to 'sfc', matching what they
-- already are (10m wind, the only level this ever fetched before).

ALTER TABLE flow_snapshots ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'sfc';

DROP INDEX IF EXISTS idx_flow_snapshots_layer_type_issued_at;
CREATE INDEX IF NOT EXISTS idx_flow_snapshots_layer_type_level_issued_at
  ON flow_snapshots (layer_type, level, issued_at DESC);
