-- =====================================================
-- Drill Response-Time and Participation Metrics (spec 017)
-- Covers: FR-003, FR-004, FR-005, FR-007
--
-- Adds an optional acknowledged_at timestamp to dispatch_receipts, set
-- exactly once by the new ack-dispatch Edge Function (service-role client)
-- when a recipient clicks their one-click acknowledgment link. No RLS
-- policy change — anon is never granted direct write access to
-- dispatch_receipts; the Edge Function is the only writer (research.md).
-- =====================================================

ALTER TABLE dispatch_receipts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
