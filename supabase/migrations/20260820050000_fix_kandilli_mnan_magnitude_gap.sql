-- Follow-up to 20260820040000: the aggregator's old (still-buggy) build kept
-- polling Kandilli every 20s in the gap between that migration being
-- applied and the mhews-aggregator Docker container actually being
-- rebuilt/restarted with the fix, writing a further 47 "MNaN" rows in the
-- meantime. Same fix, re-run against whatever still matches — idempotent,
-- a clean container will never produce a 'MNaN%' title again so this
-- targets only that gap window.
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
