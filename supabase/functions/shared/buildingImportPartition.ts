// Pure record-partitioning logic for the buildings import path, mirroring
// roadImportPartition.ts's convention exactly (spec 040 -> spec 044).

import { validateBuildingRecord, type ValidationResult } from './validateBuildingRecord.ts'
import type { BuildingRecord } from './buildingRecord.ts'

export interface RejectedBuildingRecord {
  record: BuildingRecord
  reason: string
}

export interface PartitionResult {
  validRecords: BuildingRecord[]
  rejectedRecords: RejectedBuildingRecord[]
}

export function partitionBuildingRecords(
  records: BuildingRecord[],
  servedCountryCodes: string[],
): PartitionResult {
  const validRecords: BuildingRecord[] = []
  const rejectedRecords: RejectedBuildingRecord[] = []

  for (const record of records) {
    const validation: ValidationResult = validateBuildingRecord(record, servedCountryCodes)
    if (!validation.valid) {
      rejectedRecords.push({ record, reason: validation.reason })
      continue
    }
    validRecords.push(record)
  }

  return { validRecords, rejectedRecords }
}
