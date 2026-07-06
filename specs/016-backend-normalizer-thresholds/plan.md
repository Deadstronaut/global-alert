# Implementation Plan: Backend Ingestion Normalizers Read the Hazard Threshold Registry

**Branch**: `016-backend-normalizer-thresholds` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-backend-normalizer-thresholds/spec.md`

## Summary

Close the follow-up spec 010 deliberately deferred: `supabase/functions/shared/normalize.ts` and
`server/src/processors/normalizer.js` still compute severity from hardcoded `SEVERITY_FN`/`SEVERITY_MAP` tables,
completely bypassing the `hazard_thresholds` registry that spec 010 already made admin-editable for the frontend's
manual-entry path. Both runtimes gain a module-level, TTL-based cache of the registry's breakpoints, refreshed via a
fire-and-forget background fetch (using the existing service-role Supabase client pattern from `upsert.ts`) so
`normalize()`'s call signature and synchronous behavior are preserved everywhere it's already called. If the cache
is empty or stale-with-failed-refresh, both runtimes fall back to their existing hardcoded values — unchanged and
un-deleted — guaranteeing zero regression for any hazard type nobody has customized.

## Technical Context

**Language/Version**: TypeScript (Deno, Supabase Edge Functions) for `normalize.ts`; JavaScript (Node.js ≥22, ESM)
for `normalizer.js`.

**Primary Dependencies**: `@supabase/supabase-js` (already a dependency in both runtimes — `esm.sh` import in Deno,
npm package in the Node aggregator). No new dependency in either runtime.

**Storage**: PostgreSQL via Supabase — reads only from the existing `hazard_thresholds` table (spec 010). No schema
change.

**Testing**: `Deno.test` for the TS port of `evaluateBreakpoints()` and the cache's fallback behavior (matching the
existing convention in `supabase/functions/shared/*.test.ts`); Node's built-in `node --test` runner for the JS port
(the `server/` project has no test framework configured today and none is being added — `node --test` requires
zero new dependencies and the project's `package.json` already declares `"engines": {"node": ">=22.0.0"}`, which
has it built in).

**Target Platform**: Existing Supabase-hosted Deno Edge Functions; the existing standalone Node.js
`global-alert-aggregator` process (`server/`).

**Project Type**: Backend-only change across two existing runtimes in the existing project — no new project/service.

**Performance Goals**: Zero additional per-event latency in the common case (cache hit — pure in-memory lookup,
identical cost to today's hardcoded map lookup). At most one background refresh fetch per TTL window per runtime
instance, not per event (FR-004).

**Constraints**: `normalize()`'s exported signature and synchronous return type MUST NOT change in either runtime
(every existing call site — `fetch-earthquakes`, `fetch-floods`, `fetch-droughts`, `fetch-wildfires`,
`fetch-food-security`, `backfill-earthquakes`, and their Node aggregator counterparts — calls it synchronously and
is out of scope to refactor). Registry retrieval failures MUST NOT throw out of `normalize()` or block ingestion
(FR-002). Zero new npm/deno dependencies.

**Scale/Scope**: Two files modified (`normalize.ts`, `normalizer.js`), two new small cache modules (one per
runtime, not shared — different module systems/runtimes), two new test files. No new tables, no new Edge Function,
no new admin UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: PASS, and this is the feature's entire purpose — closing
  the last place severity computation was still structurally hardcoded instead of config-driven, completing what
  spec 010 started.
- **Principle II (Scope Discipline)**: PASS. No new dissemination channel, no new identity mechanism, no CAP
  change.
- **Principle III (CAP v1.2 Compliance)**: N/A — this is upstream of CAP authoring (raw ingestion normalization),
  not CAP export itself.
- **Principle IV (Data Quality & Normalization)**: PASS, directly reinforcing — "every external disaster/hazard
  data source MUST be normalized... " already requires consistent severity mapping; this feature makes that mapping
  admin-configurable at the point of normalization instead of silently diverging from the admin's configured
  intent.
- **Principle V (Access Control & Auditability)**: N/A — read-only registry access from a trusted backend process
  (service-role, same pattern as `upsert.ts`); no new writable surface, no new audit-relevant action (threshold
  edits are already audited by spec 010's existing trigger).
- **Principle VI (Accessibility & i18n)**: N/A — no UI change.
- **Principle VIII (Simplicity/YAGNI)**: PASS — deliberately rejects a shared cross-runtime cache module (TS and JS
  runtimes can't literally share code here), a push/webhook invalidation mechanism, and a new dependency, in favor
  of the simplest thing that satisfies the requirements: a TTL-polled, fire-and-forget-refreshed, fallback-safe
  in-memory cache per runtime, mirroring the already-established frontend pattern (`hazardTypes.js`) rather than
  inventing a new one.

No violations. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-backend-normalizer-thresholds/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/functions/shared/
├── normalize.ts                          # severity computation reads the cache instead of only SEVERITY_FN
├── normalize.test.ts                      # NEW — evaluateBreakpoints() TS port + cache fallback behavior
└── hazardThresholdsCache.ts               # NEW — TTL cache + fire-and-forget refresh (Deno runtime)

server/src/processors/
├── normalizer.js                          # severity computation reads the cache instead of only SEVERITY_MAP
├── normalizer.test.js                     # NEW — evaluateBreakpoints() JS port + cache fallback behavior (node --test)
└── hazardThresholdsCache.js               # NEW — TTL cache + fire-and-forget refresh (Node runtime)
```

**Structure Decision**: Existing two-runtime layout, unchanged. One new small cache module per runtime (not shared
between them — Deno/TS and Node/JS are separate module systems and separate deployable units, consistent with how
`normalize.ts`/`normalizer.js` themselves are already independently maintained "mirror" files per their own header
comments).

## Complexity Tracking

*No violations — table intentionally omitted.*

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
