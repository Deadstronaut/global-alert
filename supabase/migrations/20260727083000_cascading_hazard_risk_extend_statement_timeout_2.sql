-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #8
--
-- Live-testing finding: after seeding real starter cascade_rules (2 rules
-- per country, see 20260727082000), a real evaluate_cascade_rules call for
-- the Kahramanmaras earthquake took ~21.5s end to end (measured via a raw
-- REST call, matching the "canceling statement due to statement timeout"
-- error reported live) — close to fix-up #7's 25s override. This confirms
-- fix-up #7's finding that each rule's evaluation carries a real, roughly
-- fixed per-statement cost on this project (previously measured at ~8s for
-- a single rule; not query-shape-dependent — see fix-up #7's header for the
-- full diagnosis and the four query-rewrite attempts that didn't change it).
-- That cost scales with the number of active rules evaluated per call, so a
-- fixed 25s budget leaves very little headroom as a country accumulates
-- more than 2-3 rules.
--
-- Raised to 60s as a pragmatic safety margin (not a fix for the underlying
-- per-statement cost, which remains a known platform characteristic of this
-- project). If a country's active rule count grows enough to approach even
-- this budget, the real fix is consolidating the per-rule loop into a
-- single set-based query — a larger follow-up, not attempted here.
-- =====================================================

ALTER FUNCTION evaluate_cascade_rules(
  VARCHAR(2), TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, JSONB
) SET statement_timeout = '60s';
