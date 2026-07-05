/**
 * Parses an uploaded data file (CSV, JSON, or Excel) into a uniform
 * { headers, records } shape for the field-mapping UI. SQL files are
 * deliberately NOT supported — running arbitrary SQL from an uploaded file
 * would let any admin execute arbitrary commands against the database.
 */
import * as XLSX from 'xlsx'
import { parseCSV } from './csv.js'

function recordsToHeaders(records) {
  const keys = new Set()
  for (const r of records.slice(0, 50)) Object.keys(r).forEach((k) => keys.add(k))
  return [...keys]
}

function parseJSON(text) {
  const data = JSON.parse(text)
  const records = Array.isArray(data) ? data : Object.values(data).find((v) => Array.isArray(v)) ?? []
  return { headers: recordsToHeaders(records), records }
}

function parseXLSX(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const records = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  return { headers: recordsToHeaders(records), records }
}

export const SUPPORTED_EXTENSIONS = '.csv,.json,.xlsx,.xls'

/**
 * @param {File} file
 * @returns {Promise<{ headers: string[], records: Record<string, unknown>[] }>}
 */
export function parseDataFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = () => {
        try { resolve(parseXLSX(reader.result)) } catch (e) { reject(e) }
      }
      reader.readAsArrayBuffer(file)
    } else if (ext === 'json') {
      reader.onload = () => {
        try { resolve(parseJSON(String(reader.result))) } catch (e) { reject(e) }
      }
      reader.readAsText(file)
    } else if (ext === 'csv') {
      reader.onload = () => resolve(parseCSV(String(reader.result)))
      reader.readAsText(file)
    } else {
      reject(new Error(`Desteklenmeyen dosya türü: .${ext} (sadece CSV, JSON, Excel desteklenir)`))
    }
  })
}
