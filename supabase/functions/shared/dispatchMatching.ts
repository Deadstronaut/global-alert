// Pure recipient-matching predicate (spec 009, research.md §4; region-aware
// matching added spec 015). Matching is by country_code equality, an
// optional hazard_type filter, and an optional region_code narrowing layer —
// not polygon/bbox geofencing (contacts don't carry precise coordinates
// yet; see spec 015's research.md for why full geofencing is out of scope).

export interface DispatchableContact {
  is_active: boolean
  country_code: string
  region_code: string | null
  hazard_type_filter: string | null
  demographic_tags: string[] | null
  email: string | null
  whatsapp_number: string | null
  email_opt_in: boolean
  whatsapp_opt_in: boolean
}

export interface DispatchableCapDraft {
  country_code: string | null
  region_code: string | null
  hazard_type: string
  target_demographic_tags: string[] | null
}

export type DispatchChannel = 'email' | 'whatsapp'

function normalizeRegion(value: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

// An unset region on either side always matches — region_code is an
// additional narrowing filter for records that opt into it, never a
// replacement for country-level targeting, and never a reason to exclude a
// contact that hasn't recorded a region (spec 015 FR-003/FR-005).
function regionMatches(contactRegion: string | null, draftRegion: string | null): boolean {
  const normalizedContact = normalizeRegion(contactRegion)
  const normalizedDraft = normalizeRegion(draftRegion)
  if (normalizedContact === '' || normalizedDraft === '') return true
  return normalizedContact === normalizedDraft
}

// spec 060: an alert can optionally target specific demographic groups
// (e.g. elderly, disability, displaced) — an empty/unset target list means
// "everyone", exactly like an unset hazard_type_filter/region_code never
// excludes. When the draft DOES set target tags, only contacts carrying at
// least one matching tag qualify; a contact with no tags of its own never
// matches a demographically-targeted draft (it isn't known to belong to
// that group), but still matches every untargeted draft.
function demographicMatches(contactTags: string[] | null, draftTargetTags: string[] | null): boolean {
  if (!draftTargetTags || draftTargetTags.length === 0) return true
  if (!contactTags || contactTags.length === 0) return false
  return contactTags.some((tag) => draftTargetTags.includes(tag))
}

export function matchesContact(
  contact: DispatchableContact,
  draft: DispatchableCapDraft,
  channel: DispatchChannel,
): boolean {
  if (!contact.is_active) return false
  if (draft.country_code == null || contact.country_code !== draft.country_code) return false
  if (contact.hazard_type_filter != null && contact.hazard_type_filter !== draft.hazard_type) return false
  if (!regionMatches(contact.region_code, draft.region_code)) return false
  if (!demographicMatches(contact.demographic_tags, draft.target_demographic_tags)) return false

  if (channel === 'email') {
    return contact.email_opt_in && contact.email != null
  }
  return contact.whatsapp_opt_in && contact.whatsapp_number != null
}
