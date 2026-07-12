// Pure record-partitioning logic extracted from import-kontur-population
// (spec 038 T034) so the "a batch of exclusively invalid records" edge case
// (research.md §3's "zero valid records is not a failure" convention) is
// unit-testable without mocking Supabase/fetch. The caller is still
// responsible for logging each rejection via logRejectedPayload() and for
// calling recordFetchOutcome(sourceId, 'success') unconditionally after —
// this function only decides which records are valid vs. rejected.

import { validatePopulationRecord, type ValidationResult } from './validatePopulationRecord.ts'
import type { PopulationRecord } from './populationRecord.ts'

export interface RejectedPopulationRecord {
  record: PopulationRecord
  reason: string
}

export interface PartitionResult {
  validRecords: PopulationRecord[]
  rejectedRecords: RejectedPopulationRecord[]
}

export function partitionPopulationRecords(
  records: PopulationRecord[],
  servedCountryCodes: string[],
): PartitionResult {
  const validRecords: PopulationRecord[] = []
  const rejectedRecords: RejectedPopulationRecord[] = []

  for (const record of records) {
    const validation: ValidationResult = validatePopulationRecord(record, servedCountryCodes)
    if (!validation.valid) {
      rejectedRecords.push({ record, reason: validation.reason })
      continue
    }
    validRecords.push(record)
  }

  return { validRecords, rejectedRecords }
}
