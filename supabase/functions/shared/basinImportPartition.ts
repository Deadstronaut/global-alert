import type { BasinRecord } from './basinRecord.ts'
import { validateBasinRecord } from './validateBasinRecord.ts'

export interface RejectedBasinRecord {
  record: BasinRecord
  reason: string
}

export function partitionBasinRecords(
  records: BasinRecord[],
  servedCountryCodes: string[],
): { validRecords: BasinRecord[]; rejectedRecords: RejectedBasinRecord[] } {
  const validRecords: BasinRecord[] = []
  const rejectedRecords: RejectedBasinRecord[] = []

  for (const record of records) {
    const result = validateBasinRecord(record, servedCountryCodes)
    if (result.valid) {
      validRecords.push(record)
    } else {
      rejectedRecords.push({ record, reason: result.reason })
    }
  }

  return { validRecords, rejectedRecords }
}
