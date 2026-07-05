-- =====================================================
-- Optional region (province/city) assignment for org_admin/viewer accounts.
-- NOT a security restriction (country_code already handles that, see
-- 20260704_country_scoped_disaster_reads.sql) — this only powers an optional
-- "sadece bölgemi göster" map view-filter the user can toggle themselves.
-- Free text for now; validated against src/data/boundaries/<country>.json
-- province names client-side where such a boundary file exists (currently
-- only Turkey — see docs/security_roles_protocol.md for the provisioning
-- hierarchy this slots into).
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region_code TEXT;
