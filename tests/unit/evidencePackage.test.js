import { describe, it, expect } from 'vitest'
import { buildEvidencePackageManifest, buildEvidenceSummaryLines } from '@/lib/evidencePackage.js'

describe('buildEvidencePackageManifest', () => {
  it('builds a manifest with normal values', () => {
    const manifest = buildEvidencePackageManifest({
      capDraftId: 'draft-1',
      receiptCount: 12,
      auditLogCount: 5,
      generatedAt: '2026-07-07T00:00:00.000Z',
    })
    expect(manifest).toEqual({
      cap_draft_id: 'draft-1',
      generated_at: '2026-07-07T00:00:00.000Z',
      receipts: { count: 12 },
      audit_log: { count: 5 },
    })
  })

  it('marks zero counts as "no data" rather than silently zero', () => {
    const manifest = buildEvidencePackageManifest({
      capDraftId: 'draft-2',
      receiptCount: 0,
      auditLogCount: 0,
      generatedAt: '2026-07-07T00:00:00.000Z',
    })
    expect(manifest.receipts).toEqual({ count: 0, note: 'no data' })
    expect(manifest.audit_log).toEqual({ count: 0, note: 'no data' })
  })

  it('throws when capDraftId is missing', () => {
    expect(() => buildEvidencePackageManifest({ receiptCount: 1, auditLogCount: 1 })).toThrow()
  })
})

describe('buildEvidenceSummaryLines', () => {
  it('includes all supplied fields in the summary', () => {
    const lines = buildEvidenceSummaryLines({
      capDraftId: 'draft-1',
      hazardType: 'earthquake',
      severity: 'critical',
      countryCode: 'tr',
      broadcastAt: '2026-07-10T00:00:00.000Z',
      receiptCount: 12,
      auditLogCount: 5,
      generatedAt: '2026-07-15T00:00:00.000Z',
    })
    const text = lines.join('\n')
    expect(text).toContain('draft-1')
    expect(text).toContain('earthquake')
    expect(text).toContain('critical')
    expect(text).toContain('tr')
    expect(text).toContain('12')
    expect(text).toContain('5')
    expect(text).toContain('2026-07-15T00:00:00.000Z')
  })

  it('marks zero counts as "no data" rather than silently zero', () => {
    const lines = buildEvidenceSummaryLines({ capDraftId: 'draft-2', receiptCount: 0, auditLogCount: 0 })
    const text = lines.join('\n')
    expect(text).toContain('Dispatch Receipts: no data')
    expect(text).toContain('Audit Log Entries: no data')
  })

  it('falls back to "unknown" for missing optional fields', () => {
    const lines = buildEvidenceSummaryLines({ capDraftId: 'draft-3', receiptCount: 1, auditLogCount: 1 })
    const text = lines.join('\n')
    expect(text).toContain('Hazard Type: unknown')
    expect(text).toContain('Severity: unknown')
    expect(text).toContain('Country: unknown')
    expect(text).toContain('Broadcast At: unknown')
  })

  it('throws when capDraftId is missing', () => {
    expect(() => buildEvidenceSummaryLines({ receiptCount: 1, auditLogCount: 1 })).toThrow()
  })
})
