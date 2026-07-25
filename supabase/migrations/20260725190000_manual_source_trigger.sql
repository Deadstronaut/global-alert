-- =====================================================
-- Adds data_sources.manual_trigger_requested_at — lets an admin actually
-- run an automation_kind='manual' custom source's fetch on demand.
--
-- Found live 2026-07-25: after adding the "Elle güncelleyeceğim" frequency
-- option (20260725180000_data_sources_automation_kind.sql), there was
-- nowhere in the UI to actually DO that manual update — dynamicSources.js
-- correctly stops auto-polling 'manual' rows, but nothing let an admin
-- trigger a one-off fetch either. A dead end.
--
-- This repo's server/src/index.js has an explicit, deliberate rule: "Frontend
-- ile DOĞRUDAN iletişim YOK — frontend Supabase Realtime üzerinden okur" (the
-- frontend never talks to the aggregator directly). So this can't be a new
-- HTTP endpoint on the aggregator called from the browser — it has to be a
-- DB-mediated signal the aggregator's own dynamicSources.js (which already
-- re-scans data_sources every 60s) picks up and acts on, same as every other
-- config change (interval edits, new sources) already works today.
-- =====================================================

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS manual_trigger_requested_at TIMESTAMPTZ;
