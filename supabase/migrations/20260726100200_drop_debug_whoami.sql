-- Drops a temporary diagnostic function used to verify
-- 20260726100000_audit_log_changed_by.sql's fix actually resolves auth.uid()
-- inside a real request (it does — live-verified 2026-07-25). Never meant
-- to ship; cleaning it up here rather than leaving debug cruft in the schema.
DROP FUNCTION IF EXISTS public.debug_whoami();
