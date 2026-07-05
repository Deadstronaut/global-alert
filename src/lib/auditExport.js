// Pure client-side export helpers for the Audit & Compliance viewer (spec 007).
// Rows are already RLS-filtered (super_admin-only) by the time they reach here.

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(
      typeof row[h] === 'object' && row[h] !== null ? JSON.stringify(row[h]) : row[h]
    )).join(','))
  }
  return lines.join('\n')
}

export function rowsToJson(rows) {
  return JSON.stringify(rows ?? [], null, 2)
}

export function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
