# Phase 0 Research: Partner Review Response Bundle

No `NEEDS CLARIFICATION` markers remained in Technical Context — all unknowns were resolved via direct codebase inspection before this document was written. Findings below.

## 1. Collapsible/accordion primitive for the unified 2D layer panel

**Decision**: Use the already-installed shadcn-vue `ui/collapsible` component (`Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`) for the four consolidated layer-group sections.

**Rationale**: The codebase already has two competing hand-rolled accordion implementations (`SidebarPanel.vue`'s `openSections`/`toggleSection()` pattern, and MapView.vue's per-panel local-ref collapse pattern used for shelters/exposure panels), plus raw `<details>` in two other admin components. `ui/collapsible` is already a dependency (used in `AppSidebar.vue`) and is the closest to a project-standard primitive. Introducing a third hand-rolled pattern would violate Simplicity/YAGNI; migrating fully off the other two patterns is out of scope for this feature (they're not touched by the partner review) — only the four groups being newly consolidated adopt it.

**Alternatives considered**: (a) Extend `SidebarPanel.vue`'s existing `openSections` pattern — rejected because it's bespoke to that component's specific sections and shelters/exposure/wind-current currently live outside it entirely, in MapView.vue; reusing it would require lifting state across components unnecessarily. (b) Native `<details>`/`<summary>` — rejected, weaker styling/animation control than the app's existing `Transition`-based expand pattern, and shadcn-vue is already the emerging UI standard per the `shadcn-ui-migration` work already in this repo.

## 2. Where consolidated layer state should live

**Decision**: Keep active/visible + opacity state as local component state in the (now single) unified panel component, matching the existing pattern (`isLayerVisible()`, `getLayerOpacity()` today live as local refs in `MapView.vue`, not in Pinia).

**Rationale**: Pinia stores (`mapLayersStore`, `exposureLayersStore`) currently hold only layer *definitions/metadata* from Supabase, not session-scoped UI state (visibility/opacity). Moving this into Pinia would be a state-management architecture change not requested by the partner review and not needed to satisfy the spec's acceptance criteria — Simplicity/YAGNI applies.

**Alternatives considered**: Lifting visibility/opacity into Pinia for cross-component reactivity — rejected as unnecessary scope expansion; the consolidation only requires that the four groups render from one panel location, not that their state model changes.

## 3. SOP document file upload path

**Decision**: Client-side direct upload via `supabase.storage.from('sop-documents').upload(...)`, gated by a Storage RLS policy that mirrors the existing `sop_documents` table write policy (`super_admin`/`country_admin`/`org_admin`, per `20260707140100_sop_documents.sql:33-36`). New nullable columns (`attachment_path`, `attachment_name`, `attachment_type`) added to `sop_documents` to reference the uploaded file.

**Rationale**: Every existing Storage bucket in this codebase (`satellite-imagery`, `community-report-photos`, `community-report-audio`, `flow-snapshots`, `overlay-snapshots`, `forecast-snapshots`) happens to be written server-side (Edge Function or mobile client), but that's an artifact of those specific features (server-computed imagery, mobile-app-originated reports) — none of them establish a hard rule against client-side upload. Direct client upload with a Storage RLS policy is the standard, simplest Supabase-native pattern (Principle VIII) and avoids standing up a new Edge Function solely to relay bytes an already-authenticated, already-authorized admin user is uploading themselves.

**Alternatives considered**: A new Edge Function (mirroring `import-satellite-imagery`) that receives the file and writes it server-side — rejected as unnecessary indirection; that pattern exists in this codebase for cases involving server-side processing (image resizing, format conversion) or non-authenticated mobile submission (community reports), neither of which applies to an authenticated admin uploading a PDF/DOCX SOP document.

## 4. District-level (ADM2) impact analysis

**Decision**: Add a UI selector option calling the already-existing `loadRegionBoundaries(countryCode, 'district')`, which already has bundled fallback data for `tr`, `mg`, `my` and checks the `country_boundaries` DB table first for any country/level combination stored there.

**Rationale**: `loadRegionBoundaries` already accepts a `level` parameter and `'district'` is already a supported, exercised value elsewhere (`SheltersPanel.vue`). No schema or data-loading change is needed — purely a UI wiring task in `ImpactPanel.vue`, plus a graceful "not available" state when neither the DB table nor the bundled loader has data for the selected country.

**Alternatives considered**: Building a new district-boundary ingestion pipeline — rejected, out of scope; the partner's request was about the analysis feature being connected to district level, and the data path already exists.

## 5. CAP warning radius field

**Decision**: Add a plain numeric input bound to `radius_km` in `CapView.vue`'s existing form, with the same inline validation style already used for other required fields in that form and in `SopDocumentFormModal.vue` (no new validation composable/library introduced).

**Rationale**: `cap_drafts.radius_km` already exists as a column and is already threaded through change-tracking triggers and CAP envelope export; only the authoring UI is missing. Matching the existing inline-validation convention keeps the change minimal and consistent with the rest of the form.

**Alternatives considered**: Introducing a shared form-validation library/composable — rejected as disproportionate to a single optional numeric field; no other form in the codebase uses one, so adding it here would introduce an inconsistent pattern for a small win.

## 6. Scenario Modeling relocation

**Decision**: Render `ScenarioBuilder.vue` from inside `ImpactPanel.vue` as an "Advanced" sub-mode (e.g., a mode toggle/tab within the panel), and remove its direct mount from `AdminView.vue`. No new route is created or removed (`ScenarioBuilder` was never a standalone route — it was always inline-mounted in `AdminView.vue`, served at the existing `/admin` route). No role/RLS change is made in this pass (deferred to Story 7b / a future spec) — access remains exactly whatever reaches `AdminView.vue` today, just re-parented under Impact Analyzer's UI instead of sitting alongside other admin panels.

**Rationale**: The spec explicitly scopes this story to navigation/structure only, per user direction, to avoid building RLS against a role taxonomy that's still under negotiation with the partner. The existing `useAuthStore().isSuperAdmin`-style client-side role-check convention (paired with server-side RLS on `profiles.role`) is documented here for reuse by the future Story 7b spec, but is not implemented now.

**Alternatives considered**: Implementing role gating now with the current 4-role system and revisiting later — explicitly rejected by the user in this conversation, to avoid a rebuild once the partner's role taxonomy is finalized.
