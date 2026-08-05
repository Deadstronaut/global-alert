-- overlay_snapshots: add 'level' (spec 054 follow-up, 2026-08-06: Height
-- selector — Temp/RH now come in multiple GFS pressure levels, not just
-- surface). Existing rows default to 'sfc', matching what they already
-- are (2m Temp / 2m RH / column-integrated fields never had a level
-- concept until now).

ALTER TABLE overlay_snapshots ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'sfc';

-- "Current" snapshot per (overlay_type, level) = latest issued_at —
-- replaces the old (overlay_type, issued_at) index now that level is
-- part of what identifies "which snapshot".
DROP INDEX IF EXISTS idx_overlay_snapshots_type_issued_at;
CREATE INDEX IF NOT EXISTS idx_overlay_snapshots_type_level_issued_at
  ON overlay_snapshots (overlay_type, level, issued_at DESC);
