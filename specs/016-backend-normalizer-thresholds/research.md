# Research: Backend Ingestion Normalizers Read the Hazard Threshold Registry

No `[NEEDS CLARIFICATION]` markers remain — every open question was resolvable from existing, already-established
patterns in this codebase.

## Decision: Fire-and-forget, TTL-based, module-level cache (not a synchronous await per event)

**Rationale**: `normalize()` in both runtimes is called synchronously from every `fetch-*` Edge Function and the
Node aggregator's polling loops — spec.md's Constraints explicitly rule out converting these call sites to async as
out of scope (a large, risky refactor unrelated to this feature's actual goal). A cache that is read synchronously
and refreshed in the background (checking `Date.now() - fetchedAt > TTL_MS` on each `normalize()` call, and kicking
off a non-awaited refresh promise if stale) satisfies FR-004 (no per-event live lookup) without touching any call
site's signature.

**Alternatives considered**:
- Await the registry fetch inside `normalize()` — rejected: makes `normalize()` async, which cascades into every
  caller across both runtimes; explicitly out of scope per the Constraints.
- A scheduled/cron-triggered refresh (e.g. a separate Supabase cron job writing to a shared table or KV) — rejected
  as over-engineered for this feature: a per-process in-memory cache with opportunistic refresh is simpler, needs
  no new infrastructure, and already matches this project's Simplicity/YAGNI principle and the frontend's own
  `hazardTypes.js` pattern (load once, cache, refresh on demand).

## Decision: Fallback to existing hardcoded values, never deleted

**Rationale**: FR-002/FR-003/SC-002/SC-003 all require zero regression and zero ingestion failures when the
registry is unavailable or a hazard type has no custom configuration. Keeping `SEVERITY_FN`/`SEVERITY_MAP` in place
as the fallback (rather than replacing them with, say, a thrown error or a hardcoded `'low'` default) is the only
option that guarantees byte-for-byte identical behavior for every hazard type nobody has touched — exactly
mirroring how `src/stores/hazardTypes.js`'s `FALLBACK_THRESHOLDS` already does this for the frontend path (spec
010's own precedent).

**Alternatives considered**: Deleting the hardcoded maps and defaulting to `'low'`/`'moderate'` on any cache miss —
rejected: this would be a regression for the (currently 100%) case of hazard types with no custom threshold, the
opposite of FR-003's requirement.

## Decision: Service-role Supabase client for the registry read (not anon key, not user session)

**Rationale**: `hazard_thresholds`'s `read_active_hazard_thresholds` RLS policy (spec 010,
`20260707130000_hazard_taxonomy.sql`) grants `SELECT` `TO authenticated` only — there is no anon-readable policy.
Both ingestion runtimes operate without a user session (they are trusted backend processes). `upsert.ts` (used by
every `fetch-*` Edge Function today) already establishes the precedent of using a service-role client
(`getServiceClient()`) to bypass RLS for trusted backend writes; using the same pattern for this read is consistent
and requires no RLS policy change.

**Alternatives considered**: Adding an anon-readable RLS policy on `hazard_thresholds` — rejected: widens the
table's public exposure surface for no reason when a trusted backend process already has a established, narrower
mechanism (service-role) available; also out of scope per spec.md's Assumptions ("no admin-facing UI changes... "
implies no RLS/schema changes either).

## Decision: Independent (non-shared) cache module per runtime

**Rationale**: `normalize.ts` (Deno/TypeScript, `esm.sh` imports) and `normalizer.js` (Node.js/CommonJS-or-ESM, npm
imports) are different module systems in different deployable units — there is no practical way to share a single
cache module file between them, and the project's existing convention (per `normalize.ts`'s own header comment,
"Mirrors server/src/processors/normalizer.js — keep in sync") already accepts maintaining two independently-synced
copies of this kind of logic rather than forcing a shared package.

**Alternatives considered**: Extracting a shared npm package consumed by both — rejected as disproportionate
infrastructure (a new publishable package, build step, and versioning concern) for ~40 lines of cache logic in a
project whose explicit Simplicity/YAGNI principle already rejected bigger unifications (e.g. two independent
hazard type arrays across many Vue components, until spec 010 addressed the *frontend* half specifically).

## Decision: TTL of 5 minutes

**Rationale**: SC-001 requires threshold changes to take effect "within one ingestion cycle... without requiring a
deployment, restart, or manual intervention" — not instantaneously. This project's existing ingestion cadence
(per `docs/iş planı istereler.txt`, sensor/source polling already runs on multi-second-to-multi-minute intervals
depending on hazard type) means a 5-minute cache window is well within "one ingestion cycle" for slower-changing
hazards and a small, bounded staleness window for the fastest ones — consistent with treating this as an
operational/administrative setting, not a safety-critical one (spec.md Assumptions).

**Alternatives considered**: No caching (always fetch) — rejected, violates FR-004 explicitly. A much longer TTL
(e.g. 1 hour) — rejected as unnecessarily conservative given SC-001's "one ingestion cycle" framing; 5 minutes is a
reasonable middle ground that doesn't need to be exact, since it's an internal implementation detail, not a
user-facing contract.
