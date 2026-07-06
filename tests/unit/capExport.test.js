import { describe, it, expect } from 'vitest'
import { capMsgType, escapeXml, hazardTypeToCapCategory, generateCapXml, generateCapJson } from '@/lib/capExport.js'

const baseDraft = {
  id: 'draft-uuid-1',
  sender: 'GEWS@tr.gews.local',
  hazard_type: 'earthquake',
  severity: 'high',
  certainty: 'observed',
  urgency: 'immediate',
  title: 'Test Alert',
  description: 'A test description',
  instructions: 'Take cover',
  area_desc: 'Istanbul',
  effective_at: '2026-07-06T10:00:00.000Z',
  expires_at: '2026-07-06T14:00:00.000Z',
  created_at: '2026-07-06T09:55:00.000Z',
  status: 'broadcast',
  supersedes_id: null,
  is_exercise: false,
}

describe('capMsgType', () => {
  it('returns Alert for a standalone, non-superseding draft', () => {
    expect(capMsgType(baseDraft)).toBe('Alert')
  })

  it('returns Update when supersedes_id is set and status is not a cancel-like status', () => {
    expect(capMsgType({ ...baseDraft, supersedes_id: 'other-id' })).toBe('Update')
  })

  it('returns Cancel for cancelled status', () => {
    expect(capMsgType({ ...baseDraft, status: 'cancelled' })).toBe('Cancel')
  })

  it('returns Cancel for false_alarm status', () => {
    expect(capMsgType({ ...baseDraft, status: 'false_alarm' })).toBe('Cancel')
  })

  it('returns Cancel for all_clear status', () => {
    expect(capMsgType({ ...baseDraft, status: 'all_clear' })).toBe('Cancel')
  })

  it('prioritizes Cancel over Update when both conditions hold', () => {
    expect(capMsgType({ ...baseDraft, status: 'cancelled', supersedes_id: 'other-id' })).toBe('Cancel')
  })
})

describe('hazardTypeToCapCategory', () => {
  it('maps known hazard types', () => {
    expect(hazardTypeToCapCategory('earthquake')).toBe('Geo')
    expect(hazardTypeToCapCategory('wildfire')).toBe('Fire')
    expect(hazardTypeToCapCategory('flood')).toBe('Met')
    expect(hazardTypeToCapCategory('epidemic')).toBe('Health')
  })

  it('falls back to Other for unknown hazard types', () => {
    expect(hazardTypeToCapCategory('landslide')).toBe('Other')
  })
})

describe('escapeXml', () => {
  it('escapes all five XML-significant characters', () => {
    expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;')
  })

  it('returns empty string for null/undefined', () => {
    expect(escapeXml(null)).toBe('')
    expect(escapeXml(undefined)).toBe('')
  })
})

describe('generateCapXml', () => {
  it('contains every OASIS CAP v1.2-mandated field', () => {
    const xml = generateCapXml(baseDraft)
    expect(xml).toContain('<identifier>draft-uuid-1</identifier>')
    expect(xml).toContain('<sender>GEWS@tr.gews.local</sender>')
    expect(xml).toContain('<sent>')
    expect(xml).toContain('<msgType>Alert</msgType>')
    expect(xml).toContain('<scope>Public</scope>')
    expect(xml).toContain('<category>Geo</category>')
    expect(xml).toContain('<event>earthquake</event>')
    expect(xml).toContain('<urgency>immediate</urgency>')
    expect(xml).toContain('<severity>high</severity>')
    expect(xml).toContain('<certainty>observed</certainty>')
    expect(xml).toContain('<effective>')
    expect(xml).toContain('<expires>')
    expect(xml).toContain('<headline>Test Alert</headline>')
    expect(xml).toContain('<description>A test description</description>')
    expect(xml).toContain('<areaDesc>Istanbul</areaDesc>')
  })

  it('escapes XML-significant characters in user-supplied fields', () => {
    const xml = generateCapXml({ ...baseDraft, title: `Alert & "Warning" <urgent>` })
    expect(xml).toContain('Alert &amp; &quot;Warning&quot; &lt;urgent&gt;')
    expect(xml).not.toContain('<urgent>')
  })

  it('sets status to Actual for a non-exercise alert', () => {
    expect(generateCapXml(baseDraft)).toContain('<status>Actual</status>')
  })

  it('sets status to Exercise for an exercise-flagged alert (spec 013)', () => {
    expect(generateCapXml({ ...baseDraft, is_exercise: true })).toContain('<status>Exercise</status>')
  })

  it('includes a references element when a superseded draft is provided', () => {
    const superseded = { sender: 'GEWS@tr.gews.local', id: 'old-uuid', effective_at: '2026-07-05T10:00:00.000Z' }
    const xml = generateCapXml({ ...baseDraft, supersedes_id: 'old-uuid' }, superseded)
    expect(xml).toContain('<references>GEWS@tr.gews.local,old-uuid,2026-07-05T10:00:00.000Z</references>')
    expect(xml).toContain('<msgType>Update</msgType>')
  })

  it('omits references when no superseded draft is provided', () => {
    expect(generateCapXml({ ...baseDraft, supersedes_id: 'old-uuid' }, null)).not.toContain('<references>')
  })
})

describe('generateCapJson', () => {
  it('produces the same field values as generateCapXml for a shared draft', () => {
    const json = generateCapJson(baseDraft)
    expect(json.identifier).toBe('draft-uuid-1')
    expect(json.sender).toBe('GEWS@tr.gews.local')
    expect(json.msgType).toBe('Alert')
    expect(json.scope).toBe('Public')
    expect(json.status).toBe('Actual')
    expect(json.info.category).toBe('Geo')
    expect(json.info.headline).toBe('Test Alert')
    expect(json.info.area.areaDesc).toBe('Istanbul')
  })

  it('includes references when a superseded draft is provided', () => {
    const superseded = { sender: 'GEWS@tr.gews.local', id: 'old-uuid', effective_at: '2026-07-05T10:00:00.000Z' }
    const json = generateCapJson({ ...baseDraft, supersedes_id: 'old-uuid' }, superseded)
    expect(json.references).toBe('GEWS@tr.gews.local,old-uuid,2026-07-05T10:00:00.000Z')
  })
})
