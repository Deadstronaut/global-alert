// Pure record-partitioning logic for the road import path, mirroring
// populationImportPartition.ts (spec 038 T034) so the "a batch of
// exclusively invalid records" edge case (research.md §5's "zero valid
// records/countries is not a failure" convention) is unit-testable without
// mocking Supabase/fetch. The caller is still responsible for logging each
// rejection via logRejectedPayload() and for calling
// recordFetchOutcome(sourceId, 'success') unconditionally after — this
// function only decides which records are valid vs. rejected.

import { validateRoadRecord, type ValidationResult } from './validateRoadRecord.ts'
import type { RoadRecord } from './roadRecord.ts'

export interface RejectedRoadRecord {
  record: RoadRecord
  reason: string
}

export interface PartitionResult {
  validRecords: RoadRecord[]
  rejectedRecords: RejectedRoadRecord[]
}

export function partitionRoadRecords(
  records: RoadRecord[],
  servedCountryCodes: string[],
): PartitionResult {
  const validRecords: RoadRecord[] = []
  const rejectedRecords: RejectedRoadRecord[] = []

  for (const record of records) {
    const validation: ValidationResult = validateRoadRecord(record, servedCountryCodes)
    if (!validation.valid) {
      rejectedRecords.push({ record, reason: validation.reason })
      continue
    }
    validRecords.push(record)
  }

  return { validRecords, rejectedRecords }
}
