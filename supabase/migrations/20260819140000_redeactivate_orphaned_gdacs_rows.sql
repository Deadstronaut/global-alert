-- =====================================================
-- Re-deactivates the same 4 orphaned legacy GDACS data_sources rows
-- 20260723000000_deactivate_orphaned_gdacs_rows.sql already deactivated —
-- live audit 2026-08-19 found all 4 back to is_active=true, health_state
-- 'healthy', each with a slightly different updated_at on 2026-07-25
-- (18:02 / 19:46:03 / 19:46:09 / 19:46:13) — individual manual
-- "▶ Etkinleştir" clicks from the admin Sources panel, not a migration or
-- code path, most likely someone re-enabling what looked like an inactive
-- source without knowing these are the deliberately-orphaned pre-
-- consolidation duplicates (see that migration's header for the full
-- explanation: nothing in this codebase polls source_type=NULL GDACS rows,
-- the real feed is the two multi_hazard/'gdacs_rest'+'gdacs_rss' rows).
--
-- Re-activating them didn't cause any duplicate fetching (still nothing
-- polls them) — just cosmetic clutter in the admin Sources health report
-- ("Henüz Çalıştırılmadı" for 4 rows that will never run). Deactivated
-- again, not deleted, same reasoning as the original migration.
-- =====================================================

UPDATE data_sources
SET is_active = false, health_state = 'disabled'
WHERE name = 'GDACS'
  AND source_type IS NULL
  AND hazard_type IN ('drought', 'earthquake', 'flood', 'wildfire');
