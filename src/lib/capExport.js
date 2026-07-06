// CAP v1.2 export (spec 014). Pure functions — no DB/network access — so a
// caller must fetch `draft` and (when `draft.supersedes_id` is set) the
// superseded draft's own `{ sender, id, effective_at }` before calling these.

const HAZARD_TO_CAP_CATEGORY = {
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

export function hazardTypeToCapCategory(hazardType) {
  return HAZARD_TO_CAP_CATEGORY[hazardType] || 'Other'
}

export function capMsgType(draft) {
  if (['cancelled', 'false_alarm', 'all_clear'].includes(draft.status)) return 'Cancel'
  if (draft.supersedes_id) return 'Update'
  return 'Alert'
}

export function escapeXml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toCapDateTime(value) {
  if (!value) return ''
  return new Date(value).toISOString()
}

function buildReferences(supersededDraft) {
  if (!supersededDraft) return null
  return `${supersededDraft.sender},${supersededDraft.id},${toCapDateTime(supersededDraft.effective_at)}`
}

export function generateCapXml(draft, supersededDraft = null) {
  const references = buildReferences(supersededDraft)
  const status = draft.is_exercise ? 'Exercise' : 'Actual'

  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${escapeXml(draft.id)}</identifier>
  <sender>${escapeXml(draft.sender)}</sender>
  <sent>${toCapDateTime(draft.created_at)}</sent>
  <status>${status}</status>
  <msgType>${capMsgType(draft)}</msgType>
  <scope>Public</scope>${references ? `\n  <references>${escapeXml(references)}</references>` : ''}
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

export function generateCapJson(draft, supersededDraft = null) {
  const references = buildReferences(supersededDraft)
  return {
    identifier: draft.id,
    sender: draft.sender,
    sent: toCapDateTime(draft.created_at),
    status: draft.is_exercise ? 'Exercise' : 'Actual',
    msgType: capMsgType(draft),
    scope: 'Public',
    ...(references ? { references } : {}),
    info: {
      category: hazardTypeToCapCategory(draft.hazard_type),
      event: draft.hazard_type,
      urgency: draft.urgency,
      severity: draft.severity,
      certainty: draft.certainty,
      effective: toCapDateTime(draft.effective_at),
      expires: toCapDateTime(draft.expires_at),
      headline: draft.title,
      description: draft.description,
      instruction: draft.instructions,
      area: {
        areaDesc: draft.area_desc,
      },
    },
  }
}
