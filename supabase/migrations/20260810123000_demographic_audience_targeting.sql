-- =====================================================
-- Demographic Audience Targeting (spec 060)
--
-- MHEWS gap: preparedness/dissemination has never distinguished contacts or
-- alerts by demographic group (elderly, disability, displaced, etc.) — the
-- IFRC pillar's explicit call to co-produce/target warnings for "different
-- gender, youth, older persons, people with disability, poor, marginalized
-- and displaced people". Adds a free-form tag array to contacts (who they
-- are) and an optional target tag array to cap_drafts (who this alert is
-- for) — an unset/empty target list means "everyone", matching the existing
-- hazard_type_filter/region_code "unset = no restriction" convention
-- (dispatchMatching.ts). Additive only.
-- =====================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS demographic_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE cap_drafts
  ADD COLUMN IF NOT EXISTS target_demographic_tags TEXT[];

COMMENT ON COLUMN contacts.demographic_tags IS
  'Free-form tags describing this contact/audience (e.g. elderly, disability, displaced, women, youth, low_income) — used only for optional alert targeting, spec 060.';
COMMENT ON COLUMN cap_drafts.target_demographic_tags IS
  'Optional demographic targeting for this alert. NULL/empty = no restriction (matches every contact, existing behavior). Non-empty = only contacts with at least one overlapping tag in contacts.demographic_tags are matched, spec 060.';

CREATE INDEX IF NOT EXISTS idx_contacts_demographic_tags ON contacts USING GIN (demographic_tags);
