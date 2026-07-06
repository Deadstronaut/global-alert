-- =====================================================
-- Region-Scoped Dissemination Targeting (spec 015)
-- Covers: FR-001, FR-002
--
-- Adds an optional, free-text region_code to cap_drafts so a broadcast
-- alert can be scoped to a sub-national region for dispatch matching
-- (matched against contacts.region_code, which already existed unused —
-- see spec 009's contacts table). NULL preserves today's country-wide
-- targeting behavior exactly; no existing column, trigger, or constraint
-- is modified.
-- =====================================================

ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS region_code TEXT;
