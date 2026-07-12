// Pure geo-cluster summarization for the scheduled community-report digest
// (spec 036 remaining item — "zamanlanmış coğrafi küme özet raporu"). No
// PostGIS/H3 dependency: reports are grouped into fixed-size lat/lng grid
// cells, which is exactly as much precision as a periodic digest needs and
// keeps this testable as a pure function (mirrors summarizeAuditRows()'s
// separation from its DB-touching caller, spec 019).

export interface ClusterableReport {
  lat: number
  lng: number
  hazard_type: string
  country_code: string | null
}

export interface ReportCluster {
  grid_lat: number
  grid_lng: number
  report_count: number
  hazard_type_breakdown: Record<string, number>
}

export interface CountryClusterGroup {
  country_code: string | null
  total_reports: number
  clusters: ReportCluster[]
}

const DEFAULT_GRID_SIZE_DEGREES = 0.5 // ~55km at the equator — coarse enough for a digest, fine enough to be useful

// Pure — the grid cell a point falls into, returned as its center coordinate
// (not its corner), so cluster markers plot at a sensible representative point.
export function gridCellCenter(lat: number, lng: number, gridSizeDegrees = DEFAULT_GRID_SIZE_DEGREES) {
  const gridLat = (Math.floor(lat / gridSizeDegrees) + 0.5) * gridSizeDegrees
  const gridLng = (Math.floor(lng / gridSizeDegrees) + 0.5) * gridSizeDegrees
  return { gridLat, gridLng }
}

// Pure — groups reports first by country_code (null country kept as its own
// group rather than silently dropped or merged into another country's
// bucket), then into grid cells within each country group.
export function clusterReportsByCountryAndGrid(
  reports: ClusterableReport[],
  gridSizeDegrees = DEFAULT_GRID_SIZE_DEGREES,
): CountryClusterGroup[] {
  const byCountry = new Map<string | null, ClusterableReport[]>()
  for (const report of reports) {
    const key = report.country_code
    if (!byCountry.has(key)) byCountry.set(key, [])
    byCountry.get(key)!.push(report)
  }

  const groups: CountryClusterGroup[] = []
  for (const [countryCode, countryReports] of byCountry) {
    const cellsByKey = new Map<string, ReportCluster>()
    for (const report of countryReports) {
      const { gridLat, gridLng } = gridCellCenter(report.lat, report.lng, gridSizeDegrees)
      const key = `${gridLat}_${gridLng}`
      if (!cellsByKey.has(key)) {
        cellsByKey.set(key, { grid_lat: gridLat, grid_lng: gridLng, report_count: 0, hazard_type_breakdown: {} })
      }
      const cell = cellsByKey.get(key)!
      cell.report_count += 1
      cell.hazard_type_breakdown[report.hazard_type] = (cell.hazard_type_breakdown[report.hazard_type] ?? 0) + 1
    }

    groups.push({
      country_code: countryCode,
      total_reports: countryReports.length,
      clusters: [...cellsByKey.values()].sort((a, b) => b.report_count - a.report_count),
    })
  }

  return groups
}
