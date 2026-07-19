import type { PopulationRasterRecord } from './populationRasterRecord.ts'
import { validatePopulationRasterRecord } from './validatePopulationRasterRecord.ts'

export interface RejectedPopulationRasterRecord {
  record: PopulationRasterRecord
  reason: string
}

export function partitionPopulationRasterRecords(
  records: PopulationRasterRecord[],
  servedCountryCodes: string[],
): { validRecords: PopulationRasterRecord[]; rejectedRecords: RejectedPopulationRasterRecord[] } {
  const validRecords: PopulationRasterRecord[] = []
  const rejectedRecords: RejectedPopulationRasterRecord[] = []

  for (const record of records) {
    const result = validatePopulationRasterRecord(record, servedCountryCodes)
    if (result.valid) {
      validRecords.push(record)
    } else {
      rejectedRecords.push({ record, reason: result.reason })
    }
  }

  return { validRecords, rejectedRecords }
}
