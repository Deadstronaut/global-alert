# Phase 1 Data Model: Partner Review Response Bundle

This feature adds no new tables. It adds nullable columns to one existing table and one new Storage bucket + RLS policy. Everything else (radius, district boundaries, roles) reuses existing schema unchanged.

## Modified: `sop_documents`

Existing columns (unchanged): `id, title, hazard_type_code, body_content, reference_url, is_active, created_by, created_at, updated_at`.

New nullable columns:

| Column | Type | Notes |
|---|---|---|
| `attachment_path` | `text` | Storage object path within the `sop-documents` bucket. `NULL` when the SOP entry was authored as typed text only (existing behavior, unchanged default). |
| `attachment_name` | `text` | Original uploaded filename, for display. |
| `attachment_type` | `text` | MIME type, constrained at application/storage-policy level to the allowlist (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`). |

**Validation rules**:
- If `attachment_path` is set, `attachment_name` and `attachment_type` MUST also be set (all-or-nothing; enforced at the application layer, not a DB constraint, consistent with how other optional-group fields are handled elsewhere in this schema).
- `attachment_type` MUST be one of the allowlisted MIME types; enforced client-side (reject before upload) and via the Storage bucket's RLS/policy check.
- Max file size enforced client-side before upload attempt (exact limit is an implementation-time default per spec.md Assumptions, not partner-mandated).
- The existing AI-summary workflow (`aiAssistance.requestSummary('sop_documents', id, bodyContent, countryCode)`) continues to operate on `body_content`; when a document is upload-originated, the implementation MUST populate `body_content` from the uploaded file's extracted/summarized text (or leave it editable post-upload) so the existing summary flow keeps working unchanged — no change to `aiAssistance`'s contract.

**RLS**: No change — the existing `sop_documents` table RLS policy (`20260707140100_sop_documents.sql:33-36`, write access limited to `super_admin`/`country_admin`/`org_admin`) already covers writes to these new nullable columns; only a corresponding Storage-bucket policy (below) is new.

## New: Storage bucket `sop-documents`

| Property | Value |
|---|---|
| `id` / `name` | `sop-documents` |
| `public` | `false` (private — served via signed URL or authenticated fetch, not `getPublicUrl`, since SOP content may be sensitive procedural documents) |
| Path convention | `{country_code}/{sop_document_id}/{filename}`, mirroring the folder-per-entity convention used by other buckets in this codebase |

**RLS policy**: Mirrors the existing `sop_documents` table write policy — `INSERT`/`UPDATE` allowed only for roles `super_admin`, `country_admin`, `org_admin` (and, for country-scoped roles, only within their own `country_code` prefix, consistent with existing country-locking patterns elsewhere). `SELECT` allowed to the same roles that can currently read `sop_documents`.

## Unchanged, reused entities (documented here for traceability only)

- **`cap_drafts.radius_km`** (`DOUBLE PRECISION`, already exists per `20260605120100_cap_drafts.sql:38`) — no schema change; only becomes reachable through the CapView.vue form. Validation: application-layer check that, if provided, the value is `> 0`.
- **`country_boundaries`** (existing table, `level` column already supports `'district'` alongside `'province'`) — no schema change; `ImpactPanel.vue` will pass `'district'` as the `level` argument to the existing `loadRegionBoundaries()` function.
- **`profiles.role`** (existing enum: `super_admin`, `country_admin`, `org_admin`, `viewer`) — no schema change in this feature. Referenced only for traceability toward the deferred Story 7b (role-based Scenario Modeling gating), which is explicitly out of scope for this plan.
- **`contacts` / Contact Directory entities** — no schema change; only the `contacts.tabLabel` i18n string content changes.

## State Transitions

- **SOP document**: `no attachment` → `attachment uploaded` (via User Story 3) → `AI summary requested` → `summary approved/rejected` (existing flow, unchanged) → `published`. An uploaded attachment can be replaced (re-upload overwrites `attachment_path` for the same SOP entry) but this feature does not require a delete-attachment-only action beyond what the existing SOP edit flow already provides for other fields.
- **CAP draft**: unchanged existing lifecycle (draft → review → publish/cancel); `radius_km` simply becomes a populatable field within the existing draft state, with no new states introduced.
- **Scenario Modeling location**: purely a UI re-parenting; no data entity or state transition changes — `hazard_scenarios` and related tables (already existing, owned by spec 039) are untouched.
