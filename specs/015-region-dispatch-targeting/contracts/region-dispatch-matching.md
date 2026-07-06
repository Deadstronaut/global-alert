# Contract: Region-Aware Dispatch Matching

This is an internal function contract (`matchesContact()` in `supabase/functions/shared/dispatchMatching.ts`), not a
public HTTP API — consistent with this project's existing pure-function contract style for CAP/dispatch logic
(`capExport.js`, `incidentStateMachine.js`).

## Function Signature (unchanged shape, extended input types)

```ts
export interface DispatchableContact {
  is_active: boolean
  country_code: string
  region_code: string | null          // NEW
  hazard_type_filter: string | null
  email: string | null
  whatsapp_number: string | null
  email_opt_in: boolean
  whatsapp_opt_in: boolean
}

export interface DispatchableCapDraft {
  country_code: string | null
  region_code: string | null          // NEW
  hazard_type: string
}

export type DispatchChannel = 'email' | 'whatsapp'

export function matchesContact(
  contact: DispatchableContact,
  draft: DispatchableCapDraft,
  channel: DispatchChannel,
): boolean
```

## Behavioral Contract

1. All pre-existing checks (`is_active`, `country_code` equality, `hazard_type_filter`, channel opt-in + reachable
   address) remain unchanged and are evaluated first.
2. A new region check is ANDed in: the contact is excluded (function returns `false`) if and only if
   **both** `contact.region_code` and `draft.region_code` are non-null/non-empty **and** they differ after
   trimming whitespace and lowercasing.
3. If either `contact.region_code` or `draft.region_code` is `null`, `undefined`, or an empty/whitespace-only
   string, the region check always passes (never excludes).
4. The function's return type and truthiness contract are unchanged: `true` = eligible for dispatch on that
   channel, `false` = not eligible.

## Backward Compatibility Guarantee

For any `contact`/`draft` pair where `draft.region_code` is `null` (the value for every `cap_drafts` row that
existed before this migration, and every new draft where the operator leaves the field blank): the function's
result is byte-for-byte identical to its pre-feature behavior. This is the testable form of FR-002/FR-007.

## Test Cases (see `dispatchMatching.test.ts`)

| # | contact.region_code | draft.region_code | Expected region check result |
|---|---|---|---|
| 1 | `null` | `null` | pass (matches, as before) |
| 2 | `"Istanbul"` | `null` | pass (draft is country-wide) |
| 3 | `null` | `"Istanbul"` | pass (contact has no region opt-in) |
| 4 | `"Istanbul"` | `"Istanbul"` | pass (exact match) |
| 5 | `"istanbul"` | `" Istanbul "` | pass (case-insensitive, trimmed) |
| 6 | `"Ankara"` | `"Istanbul"` | **fail** (genuine mismatch — only case that excludes) |
| 7 | `""` (empty string) | `"Istanbul"` | pass (empty treated as unset) |
