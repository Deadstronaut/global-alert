-- =====================================================
-- Adds a `level` column to country_boundaries so a country can have
-- separate admin-uploaded boundary sets per administrative granularity
-- (province/district/village) instead of only one boundary set per
-- country total. Previously an admin uploading e.g. village-level data
-- would silently overwrite whatever was already there (used as the
-- country's "province" view) rather than adding a new, independent level.
--
-- Existing rows (every one uploaded so far represents a country's single
-- province/ADM1 boundary set — e.g. Madagascar's, from spec 040) default
-- to 'province', so today's behavior is unchanged after this migration;
-- nothing needs re-uploading.
-- =====================================================

ALTER TABLE country_boundaries
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'province'
    CHECK (level IN ('province', 'district', 'village'));

-- Primary key widens from (country_code) to (country_code, level) so all
-- three levels can coexist per country instead of overwriting each other.
ALTER TABLE country_boundaries DROP CONSTRAINT IF EXISTS country_boundaries_pkey;
ALTER TABLE country_boundaries ADD PRIMARY KEY (country_code, level);
