import type { RiverRecord } from './riverRecord.ts'
import { validateRiverRecord } from './validateRiverRecord.ts'

export interface RejectedRiverRecord {
  record: RiverRecord
  reason: string
}

export function partitionRiverRecords(
  records: RiverRecord[],
  servedCountryCodes: string[],
): { validRecords: RiverRecord[]; rejectedRecords: RejectedRiverRecord[] } {
  const validRecords: RiverRecord[] = []
  const rejectedRecords: RejectedRiverRecord[] = []

  for (const record of records) {
    const result = validateRiverRecord(record, servedCountryCodes)
    if (result.valid) {
      validRecords.push(record)
    } else {
      rejectedRecords.push({ record, reason: result.reason })
    }
  }

  return { validRecords, rejectedRecords }
}
