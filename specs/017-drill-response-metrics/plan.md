# Implementation Plan: Drill Response-Time and Participation Metrics

**Branch**: `017-drill-response-metrics` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-drill-response-metrics/spec.md`

## Summary

Close spec 013's explicitly-deferred backlog item: drill summaries currently show only duration and an alert count,
answering neither "how fast did the team respond" nor "did recipients actually get it." User Story 1 (response
time) needs zero new infrastructure — it's a query over timestamps that already exist. User Story 2 (acknowledgment)
adds one nullable column to `dispatch_receipts`, a one-click confirmation link embedded in dispatched emails, and a
new public, unauthenticated Edge Function that renders a small confirmation page directly — no new Vue route, no
new RLS grant to `anon`, since the Edge Function is the only thing that ever touches the row (service-role,
consistent with this project's existing trusted-backend-write pattern).

## Technical Context

**Language/Version**: Vue 3 (Composition API) for `AdminView.vue`'s drill summary; TypeScript (Deno, Supabase Edge
Functions) for the new `ack-dispatch` function and the `dispatch-alert` email-body change; SQL (PostgreSQL 15,
Supabase) for the migration.

**Primary Dependencies**: Supabase JS client (already used everywhere touched). No new dependency.

**Storage**: PostgreSQL via Supabase — one additive column (`dispatch_receipts.acknowledged_at TIMESTAMPTZ NULL`).
No new table.

**Testing**: `Deno.test` for a pure `computeDrillMetrics()`-style helper (response-time-from-timestamps and
ack-rate-from-counts logic extracted as testable pure functions, consistent with this project's established
pattern of keeping DB-touching code thin and testing the decision logic separately — see spec 016's
`applyFetchResult()` precedent).

**Target Platform**: Existing Supabase-hosted Postgres + Deno Edge Functions; existing Vue 3 SPA admin screen.

**Project Type**: Web application (existing single Vue 3 + Supabase project — no new project/service).

**Performance Goals**: N/A — drill-ending and ack-confirmation are both low-frequency, human-triggered actions;
no per-event hot path is touched.

**Constraints**: `anon` role MUST NOT receive any RLS grant to write `dispatch_receipts` directly — the ack
confirmation is written exclusively by the new Edge Function using the service-role client (Principle V:
access-control discipline for a public-facing surface). The acknowledgment link MUST be visitable directly from an
email client (no JavaScript app context, no bearer token available) — the Edge Function must therefore run with
`verify_jwt = false` and return a self-contained HTML response, not JSON for a client-side app to render. Ending a
drill MUST NOT fail or block if these new metrics can't be computed for any reason (defensive, matches the
project's existing `endDrill()` error-handling shape).

**Scale/Scope**: One migration (one nullable column), one new Edge Function (`ack-dispatch`), one small change to
`dispatch-alert/index.ts` (thread `receipt.id` into `buildEmailBody()`), one extension to `AdminView.vue`'s
`endDrill()` and drill card template, one new pure-logic test file, 7-locale i18n additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — no hazard-type-specific logic.
- **Principle II (Scope Discipline)**: PASS. No new dissemination channel (acknowledgment rides on the existing
  Email channel only, per spec.md's WhatsApp-mock exclusion); no identity/federation change (the ack link itself
  is the credential, mirroring the existing Public Alert Portal's no-login precedent).
- **Principle III (CAP v1.2 Compliance)**: N/A — doesn't touch CAP authoring/export.
- **Principle IV (Data Quality & Normalization)**: N/A — no external hazard data source involved.
- **Principle V (Access Control & Auditability)**: PASS, and this is the design's central constraint — `anon` gets
  no direct table grant at all; the only write path is the new service-role Edge Function, which performs exactly
  one narrow, idempotent update (`acknowledged_at = NOW() WHERE id = X AND acknowledged_at IS NULL`). This is
  narrower than even a tightly-scoped RLS policy would be, since there's no RLS surface to reason about at all.
  `dispatch_receipts`'s existing audit trigger (`log_table_change()`) continues to fire automatically, so
  acknowledgments are already covered by the existing audit trail with zero additional code.
- **Principle VI (Accessibility & i18n)**: PASS — new drill-summary labels and the ack confirmation page copy
  added across all 7 locales.
- **Principle VIII (Simplicity/YAGNI)**: PASS — deliberately rejects a new Vue route/view + client-side fetch call
  for the ack flow (the Edge Function returning HTML directly is simpler and works with zero JS execution, which
  matters since email clients may not reliably run an SPA's JS before the user closes the tab); rejects a
  general-purpose "read receipt" or delivery-proof system in favor of the single one-click confirmation FR-003
  actually asks for.

No violations. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-drill-response-metrics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <new>_dispatch_receipts_acknowledged_at.sql   # ADD COLUMN IF NOT EXISTS acknowledged_at
└── functions/
    ├── ack-dispatch/
    │   └── index.ts                                   # NEW — public, verify_jwt=false, returns HTML
    ├── dispatch-alert/
    │   └── index.ts                                    # buildEmailBody() gains receiptId param + ack link
    └── shared/
        ├── drillMetrics.ts                              # NEW — pure computeResponseTime()/computeAckRate()
        └── drillMetrics.test.ts                          # NEW

src/views/
└── AdminView.vue                                        # endDrill() computes + displays the two new metrics

src/i18n/locales/
└── tr.json / en.json / es.json / fr.json / ru.json / ar.json / zh.json   # new drill-summary + ack-page keys

supabase/config.toml                                     # register ack-dispatch with verify_jwt = false
```

**Structure Decision**: Existing single Vue 3 + Supabase project layout. One new Edge Function, one additive
column, one new shared pure-logic module + test, extensions to two existing files (`AdminView.vue`,
`dispatch-alert/index.ts`). No new Vue route/view — the ack confirmation is served directly by the Edge Function.

## Complexity Tracking

*No violations — table intentionally omitted.*
