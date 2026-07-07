import { describe, it, expect } from 'vitest'
import { buildEvidencePackageManifest } from '@/lib/evidencePackage.js'

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
