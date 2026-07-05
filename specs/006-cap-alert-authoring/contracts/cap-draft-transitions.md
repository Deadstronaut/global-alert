# Contract: CAP Draft Status Transitions

All transitions happen via `supabase.from('cap_drafts').update({...}).eq('id', draftId)` from the
authenticated browser client (no Edge Function — enforcement is DB-side per plan.md/research.md).

## Create (blank or from source event)

```js
supabase.from('cap_drafts').insert({
  hazard_type, severity, certainty, urgency, title, description, instructions,
  area_desc, lat, lng, lang,
  effective_at, expires_at,
  source_event_id,        // NEW — nullable, set when created from a detected event
  country_code,           // from auth.countryCode (existing)
  org_id,                 // NEW — from auth session's org_id
  status: 'draft',
})
```

**Authorization**: existing RLS — org_admin/country_admin/super_admin only (`cap_drafts` INSERT
policies already restrict by role via the `FOR ALL` policies).

**Response**: normal Postgres error on RLS denial (existing pattern, unchanged).

## Submit for approval (`draft` → `pending_approval`)

```js
supabase.from('cap_drafts')
  .update({ status: 'pending_approval', last_edited_by: auth.session.id })
  .eq('id', draftId)
```

**Guard** (`guard_cap_draft_transition()`): rejects if any CAP-mandatory field is empty
(data-model.md invariant 5). Error surfaces as a Postgres exception message; `CapView.vue` MUST
show it via the existing `error.value = err.message` pattern, ideally translated via i18n key
`cap.errors.incompleteDraft`.

## Approve (`pending_approval` → `approved`) / Reject (`pending_approval` → `rejected`)

```js
supabase.from('cap_drafts')
  .update({
    status: 'approved',       // or 'rejected'
    approved_by: auth.session.id,     // only set when approving
    rejection_reason,                 // required when status === 'rejected'
  })
  .eq('id', draftId)
```

**Guard**: four-eyes (invariant 1) — rejects if `auth.uid()` equals the row's `created_by` or
`last_edited_by`. Reject additionally requires a non-empty `rejection_reason` (invariant 4).

**Expected UI behavior**: `CapView.vue` MUST NOT render the approve/reject buttons at all when
the current user is the draft's author/last editor (defense in depth — the RLS guard is the real
enforcement, the UI hide is just avoiding a confusing failed-request UX).

## Resubmit after rejection (`rejected` → `draft`)

```js
supabase.from('cap_drafts')
  .update({ status: 'draft', last_edited_by: auth.session.id })
  .eq('id', draftId)
```

**Authorization**: original author only (existing RLS scoping by `created_by`/country/org already
covers this — no new policy needed, just a new allowed transition in the guard function).

## Broadcast (`approved` → `broadcast`)

```js
supabase.from('cap_drafts')
  .update({ status: 'broadcast' })
  .eq('id', draftId)
```

**Guard**: standard transition-validity check only (no four-eyes on this specific transition per
spec — only approval/rejection require four-eyes, per FR-006's scope). After this call succeeds,
all subsequent attempts to change CAP content fields on this row are rejected by invariant 2.

## Cancel (`draft`/`pending_approval`/`approved`/`broadcast` → `cancelled`)

```js
supabase.from('cap_drafts')
  .update({ status: 'cancelled', cancellation_reason })
  .eq('id', draftId)
```

**Guard**: requires non-empty `cancellation_reason` (invariant 4).

## Conflict response (FR-014)

Any of the above, when `OLD.status` no longer matches the expected pre-transition status (a
concurrent second actor already changed it), returns a Postgres trigger exception. `CapView.vue`
MUST surface this as a distinct, user-readable message (i18n key `cap.errors.staleStatus`) rather
than the raw Postgres error text, and MUST reload the draft list so the user sees the row's actual
current state.
