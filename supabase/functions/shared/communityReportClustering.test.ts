import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { gridCellCenter, clusterReportsByCountryAndGrid } from './communityReportClustering.ts'

Deno.test('gridCellCenter: buckets nearby points into the same cell', () => {
  const a = gridCellCenter(39.91, 32.85, 0.5)
  const b = gridCellCenter(39.92, 32.86, 0.5)
  assertEquals(a, b)
})

Deno.test('gridCellCenter: distant points land in different cells', () => {
  const a = gridCellCenter(39.91, 32.85, 0.5)
  const b = gridCellCenter(41.01, 28.97, 0.5)
  assertEquals(a.gridLat === b.gridLat && a.gridLng === b.gridLng, false)
})

Deno.test('clusterReportsByCountryAndGrid: returns an empty array for no reports', () => {
  assertEquals(clusterReportsByCountryAndGrid([]), [])
})

Deno.test('clusterReportsByCountryAndGrid: groups by country then by grid cell', () => {
  const reports = [
    { lat: 39.91, lng: 32.85, hazard_type: 'earthquake', country_code: 'TR' },
    { lat: 39.92, lng: 32.86, hazard_type: 'earthquake', country_code: 'TR' },
    { lat: 39.92, lng: 32.86, hazard_type: 'flood', country_code: 'TR' },
    { lat: -18.9, lng: 47.5, hazard_type: 'flood', country_code: 'MG' },
  ]
  const groups = clusterReportsByCountryAndGrid(reports)

  assertEquals(groups.length, 2)
  const tr = groups.find((g) => g.country_code === 'TR')!
  assertEquals(tr.total_reports, 3)
  assertEquals(tr.clusters.length, 1) // all 3 TR points fall in the same 0.5° cell
  assertEquals(tr.clusters[0].report_count, 3)
  assertEquals(tr.clusters[0].hazard_type_breakdown, { earthquake: 2, flood: 1 })

  const mg = groups.find((g) => g.country_code === 'MG')!
  assertEquals(mg.total_reports, 1)
  assertEquals(mg.clusters[0].hazard_type_breakdown, { flood: 1 })
})

Deno.test('clusterReportsByCountryAndGrid: keeps a null-country group separate rather than dropping it', () => {
  const reports = [
    { lat: 10, lng: 10, hazard_type: 'wildfire', country_code: null },
  ]
  const groups = clusterReportsByCountryAndGrid(reports)
  assertEquals(groups.length, 1)
  assertEquals(groups[0].country_code, null)
  assertEquals(groups[0].total_reports, 1)
})

Deno.test('clusterReportsByCountryAndGrid: clusters are sorted by report_count descending', () => {
  const reports = [
    { lat: 0.1, lng: 0.1, hazard_type: 'flood', country_code: 'XX' },
    { lat: 10.1, lng: 10.1, hazard_type: 'flood', country_code: 'XX' },
    { lat: 10.2, lng: 10.2, hazard_type: 'flood', country_code: 'XX' },
  ]
  const groups = clusterReportsByCountryAndGrid(reports)
  const [first, second] = groups[0].clusters
  assertEquals(first.report_count, 2)
  assertEquals(second.report_count, 1)
})
