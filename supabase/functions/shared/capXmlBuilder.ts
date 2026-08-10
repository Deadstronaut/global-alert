// CAP v1.2 XML builder for Deno Edge Functions — server-side counterpart of
// src/lib/capExport.js (spec 014). Duplicated rather than imported: the
// frontend (src/) and supabase/functions/ are separate deployment units
// with no shared module boundary in this project's build. Keep in sync with
// src/lib/capExport.js if the CAP shape changes (spec 064).

const HAZARD_TO_CAP_CATEGORY: Record<string, string> = {
  earthquake: 'Geo',
  tsunami: 'Geo',
  volcano: 'Geo',
  wildfire: 'Fire',
  flood: 'Met',
  drought: 'Met',
  cyclone: 'Met',
  food_security: 'Safety',
  epidemic: 'Health',
}

export function hazardTypeToCapCategory(hazardType: string): string {
  return HAZARD_TO_CAP_CATEGORY[hazardType] || 'Other'
}

// deno-lint-ignore no-explicit-any
export function capMsgType(draft: any): string {
  if (['cancelled', 'false_alarm', 'all_clear'].includes(draft.status)) return 'Cancel'
  if (draft.supersedes_id) return 'Update'
  return 'Alert'
}

export function escapeXml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toCapDateTime(value: string | null | undefined): string {
  if (!value) return ''
  return new Date(value).toISOString()
}

// deno-lint-ignore no-explicit-any
export function generateCapXml(draft: any): string {
  const status = draft.is_exercise ? 'Exercise' : 'Actual'

  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${escapeXml(draft.id)}</identifier>
  <sender>${escapeXml(draft.sender)}</sender>
  <sent>${toCapDateTime(draft.created_at)}</sent>
  <status>${status}</status>
  <msgType>${capMsgType(draft)}</msgType>
  <scope>Public</scope>
  <info>
    <category>${hazardTypeToCapCategory(draft.hazard_type)}</category>
    <event>${escapeXml(draft.hazard_type)}</event>
    <urgency>${escapeXml(draft.urgency)}</urgency>
    <severity>${escapeXml(draft.severity)}</severity>
    <certainty>${escapeXml(draft.certainty)}</certainty>
    <effective>${toCapDateTime(draft.effective_at)}</effective>
    <expires>${toCapDateTime(draft.expires_at)}</expires>
    <headline>${escapeXml(draft.title)}</headline>
    <description>${escapeXml(draft.description)}</description>
    <instruction>${escapeXml(draft.instructions)}</instruction>
    <area>
      <areaDesc>${escapeXml(draft.area_desc)}</areaDesc>
    </area>
  </info>
</alert>
`
}
