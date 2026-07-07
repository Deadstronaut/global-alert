/**
 * spec 035 (US2): pure manifest builder for the CAP evidence package ZIP —
 * kept separate from the ZIP/download side-effects (CapView.vue) so it can
 * be unit-tested without jszip/DOM.
 */
export function buildEvidencePackageManifest({ capDraftId, receiptCount, auditLogCount, generatedAt }) {
  if (!capDraftId) throw new Error('buildEvidencePackageManifest: capDraftId is required')

  return {
    cap_draft_id: capDraftId,
    generated_at: generatedAt ?? new Date().toISOString(),
    receipts: receiptCount > 0 ? { count: receiptCount } : { count: 0, note: 'no data' },
    audit_log: auditLogCount > 0 ? { count: auditLogCount } : { count: 0, note: 'no data' },
  }
}
