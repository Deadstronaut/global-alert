# Research: Audit & Compliance Viewer

## §1. Hash-chain ordering under concurrent inserts

**Decision**: Add a `seq BIGSERIAL` column to `audit_log` as the authoritative insertion order,
rather than relying on `created_at` (a timestamp, which can collide under concurrent writes —
Edge Cases).

**Rationale**: `BIGSERIAL` guarantees a strictly increasing, gap-tolerant-but-never-duplicated
sequence assigned atomically at insert time by Postgres itself, independent of clock resolution.
The hash chain's "previous row" is unambiguously `seq = NEW.seq - 1`.

**Alternatives considered**: Ordering by `created_at, id` — rejected because two inserts in the
same transaction-commit instant could still tie on `created_at` even with a UUID tiebreaker,
whereas `BIGSERIAL` cannot tie by construction.

## §2. Hash-chain computation

**Decision**: A `BEFORE INSERT` trigger `set_audit_chain_hash()` computes
`chain_hash = encode(digest(row_content || COALESCE(prev.chain_hash, 'GENESIS'), 'sha256'), 'hex')`
where `row_content` is a stable serialization of the new row's own fields (reusing the same
field set as the existing `checksum` generated column) and `prev.chain_hash` is looked up via
`SELECT chain_hash FROM audit_log WHERE seq = NEW.seq - 1`.

**Rationale**: SHA-256 via `pgcrypto`'s `digest()` directly satisfies FR-0048/FR-006's
"cryptographic checksums"/"SHA-256 hash chain" wording. Computing it in a trigger (not a
`GENERATED ALWAYS AS` column) is required because generated columns cannot reference other rows —
only a trigger can look up the previous row.

**Alternatives considered**: Computing the chain client-side before insert — rejected, since a
client-side value cannot be trusted as tamper-evidence (the whole point of the chain is that it's
computed server-side, where the client cannot forge it).

## §3. Genesis handling for pre-existing rows (FR-008)

**Decision**: When `NEW.seq = 1` (or more generally, when the lookup `SELECT chain_hash FROM
audit_log WHERE seq = NEW.seq - 1` returns NULL — covering both "no previous row" and "previous
row predates this feature and has no chain_hash"), use the literal string `'GENESIS'` as the
previous-hash input instead of failing.

**Rationale**: The migration adds `chain_hash` to an existing, potentially non-empty table.
Backfilling a chain for historical rows would require deciding an arbitrary starting point and
offers no real security benefit (those rows' original per-row `checksum` already provides
content-integrity evidence for themselves individually — they just don't chain to each other).
Treating the first row after deployment as a fresh genesis is honest about what is actually being
guaranteed: tamper-evidence *from this feature's deployment forward*.

## §4. Integrity verification performance

**Decision**: `verify_audit_chain()` is a single SQL query using the `LAG()` window function over
`seq` order to compare each row's stored `chain_hash` against a recomputed value in one pass,
returning the first mismatching `seq` (or NULL if none).

**Rationale**: A window-function query is O(n) in one index/sequential scan, avoiding a
row-by-row PL/pgSQL loop (which would still be O(n) but with much higher per-row overhead due to
function-call/context-switch cost). This keeps the check reasonably fast without needing to pick
an arbitrary numeric SLA (Assumptions), satisfying Constitution Principle VII's resilience intent
without inventing an unfounded performance number.

**Alternatives considered**: A PL/pgSQL cursor loop recomputing and comparing row-by-row —
rejected as needlessly slower for no additional correctness benefit; the set-based query produces
an identical result.

## §5. Export mechanism

**Decision**: CSV/JSON export is generated entirely client-side in `src/lib/auditExport.js` from
rows already fetched (and already RLS-filtered to super_admin-only) via the normal
`supabase.from('audit_log').select(...)` call, using a `Blob` + temporary `<a download>` link — no
Edge Function.

**Rationale**: The data is already in the browser after the filtered query completes; generating
the file client-side avoids a redundant server round-trip and any new Edge Function surface,
consistent with Principle VIII. The 5,000-row cap (FR-005) is enforced via the query's own
`.limit(5000)`, not by fetching everything and truncating client-side — ensures the cap actually
bounds data transfer, not just display.

**Alternatives considered**: A dedicated export Edge Function generating the file server-side —
rejected as unnecessary; there is no privileged operation here that the browser client can't
already do once RLS has scoped the readable rows to the super_admin session.
