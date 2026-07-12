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

/**
 * Audit & Compliance (spec 035) remaining item — "PDF kanıt paketleri".
 * PDF generation itself needs no external account/budget (unlike the
 * MinIO/S3 object-storage half of that remaining item, still out of
 * scope); this is a pure line-builder for a one-page human-readable
 * summary, kept separate from the jsPDF/DOM side-effects (CapView.vue) for
 * the same testability reason as buildEvidencePackageManifest() above.
 */
export function buildEvidenceSummaryLines({
  capDraftId,
  hazardType,
  severity,
  countryCode,
  broadcastAt,
  receiptCount,
  auditLogCount,
  generatedAt,
}) {
  if (!capDraftId) throw new Error('buildEvidenceSummaryLines: capDraftId is required')

  return [
    'CAP Alert Evidence Package',
    '',
    `CAP Draft ID: ${capDraftId}`,
    `Hazard Type: ${hazardType ?? 'unknown'}`,
    `Severity: ${severity ?? 'unknown'}`,
    `Country: ${countryCode ?? 'unknown'}`,
    `Broadcast At: ${broadcastAt ?? 'unknown'}`,
    '',
    `Dispatch Receipts: ${receiptCount > 0 ? receiptCount : 'no data'}`,
    `Audit Log Entries: ${auditLogCount > 0 ? auditLogCount : 'no data'}`,
    '',
    `Generated At: ${generatedAt ?? new Date().toISOString()}`,
    '',
    'This summary accompanies alert.xml (CAP v1.2 envelope), receipts.csv,',
    'and audit-log.csv in the same evidence package.',
  ]
}
