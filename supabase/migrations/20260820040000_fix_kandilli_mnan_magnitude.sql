-- Bug fix (2026-08-20, user-reported: earthquake cards showing "MNaN - ...").
-- server/src/sources/kandilli.js computed magnitude as
-- Math.max(parseFloat(md), parseFloat(ml), parseFloat(ms)) — Kandilli's
-- MD (duration) and Mw (moment) columns are almost always "-.-"
-- (uncomputed for small/local Turkish quakes, where only ML is populated),
-- and parseFloat('-.-') is NaN. Math.max propagates a single NaN input to
-- its result regardless of the other (valid) arguments, so this was ALWAYS
-- NaN for virtually every Kandilli event: magnitude got stored as 0 (a
-- separate isNaN guard on that field alone) while title/description used
-- the raw NaN directly ("MNaN - ..."), silently discarding the real,
-- already-known ML magnitude in the process. Fixed in the ingest source
-- (server/src/sources/kandilli.js) going forward; this backfills the 1,723
-- already-broken rows using extra.md/extra.ml/extra.ms.
--
-- extra unwrap: a SEPARATE bug (also fixed going forward, in
-- server/src/output/supabaseWriter.js's mapToRow — it called
-- JSON.stringify() on the extra object before handing it to supabase-js,
-- which then serialized that string a second time) means every existing
-- row's `extra` column is a jsonb STRING SCALAR wrapping the real JSON
-- text, not a real jsonb object — `extra->>'ml'` on it returns NULL.
-- `extra #>> '{}'` unwraps a jsonb scalar to its raw text (here, the inner
-- JSON text), which is then cast back to jsonb to read the real fields.
UPDATE earthquake
SET
  magnitude = GREATEST(
    ((extra #>> '{}')::jsonb->>'md')::double precision,
    ((extra #>> '{}')::jsonb->>'ml')::double precision,
    ((extra #>> '{}')::jsonb->>'ms')::double precision
  ),
  title = 'M' || to_char(
    GREATEST(
      ((extra #>> '{}')::jsonb->>'md')::double precision,
      ((extra #>> '{}')::jsonb->>'ml')::double precision,
      ((extra #>> '{}')::jsonb->>'ms')::double precision
    ), 'FM990.0'
  ) || ' - ' || ((extra #>> '{}')::jsonb->>'location'),
  description = 'M' || to_char(
    GREATEST(
      ((extra #>> '{}')::jsonb->>'md')::double precision,
      ((extra #>> '{}')::jsonb->>'ml')::double precision,
      ((extra #>> '{}')::jsonb->>'ms')::double precision
    ), 'FM990.0'
  ) || ' ' || ((extra #>> '{}')::jsonb->>'location') || ' | Derinlik: ' || ((extra #>> '{}')::jsonb->>'depth') || 'km'
WHERE source = 'Kandilli'
  AND title LIKE 'MNaN%'
  AND jsonb_typeof(extra) = 'string'
  AND (extra #>> '{}')::jsonb ? 'md' AND (extra #>> '{}')::jsonb ? 'ml'
  AND (extra #>> '{}')::jsonb ? 'ms' AND (extra #>> '{}')::jsonb ? 'location'
  AND GREATEST(
    ((extra #>> '{}')::jsonb->>'md')::double precision,
    ((extra #>> '{}')::jsonb->>'ml')::double precision,
    ((extra #>> '{}')::jsonb->>'ms')::double precision
  ) IS NOT NULL;
