import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { detectParserType, parseExposureFile } from '@/utils/exposureFileParser.js'

// Minimal Shapefile binary builders — just enough of the format (Point shape,
// one record, one numeric field) for shpjs to parse, so the reprojection
// behavior below can be verified without a real fixture bundle.
function buildShp(x, y) {
  const buf = Buffer.alloc(100 + 28)
  buf.writeInt32BE(9994, 0)
  buf.writeInt32BE(64, 24)
  buf.writeInt32LE(1000, 28)
  buf.writeInt32LE(1, 32)
  buf.writeDoubleLE(x, 36)
  buf.writeDoubleLE(y, 44)
  buf.writeDoubleLE(x, 52)
  buf.writeDoubleLE(y, 60)
  buf.writeInt32BE(1, 100)
  buf.writeInt32BE(10, 104)
  buf.writeInt32LE(1, 108)
  buf.writeDoubleLE(x, 112)
  buf.writeDoubleLE(y, 120)
  return buf
}

function buildShx() {
  const buf = Buffer.alloc(100 + 8)
  buf.writeInt32BE(9994, 0)
  buf.writeInt32BE(54, 24)
  buf.writeInt32LE(1000, 28)
  buf.writeInt32LE(1, 32)
  buf.writeInt32BE(50, 100)
  buf.writeInt32BE(10, 104)
  return buf
}

function buildDbf() {
  const header = Buffer.alloc(32)
  header.writeUInt8(0x03, 0)
  header.writeInt32LE(1, 4)
  header.writeUInt16LE(65, 8)
  header.writeUInt16LE(11, 10)
  const field = Buffer.alloc(32)
  field.write('id', 0, 'ascii')
  field.write('N', 11, 'ascii')
  field.writeUInt8(10, 16)
  field.writeUInt8(0, 17)
  const terminator = Buffer.from([0x0d])
  const record = Buffer.from(' ' + '         1', 'ascii')
  const eof = Buffer.from([0x1a])
  return Buffer.concat([header, field, terminator, record, eof])
}

const UTM33N_PRJ = 'PROJCS["WGS 84 / UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]'

// A File-like stub: parseExposureFile only ever calls .name/.text()/.arrayBuffer()
function fileStub(name, arrayBuffer) {
  return { name, arrayBuffer: async () => arrayBuffer }
}

async function buildShapefileZip({ prj, x, y } = {}) {
  const zip = new JSZip()
  zip.file('t.shp', buildShp(x, y))
  zip.file('t.shx', buildShx())
  zip.file('t.dbf', buildDbf())
  if (prj) zip.file('t.prj', prj)
  const nodeBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength)
}

describe('detectParserType', () => {
  it('detects .json as geojson', () => {
    expect(detectParserType('data.json')).toBe('geojson')
  })

  it('detects .geojson as geojson', () => {
    expect(detectParserType('data.geojson')).toBe('geojson')
  })

  it('detects .zip as shapefile', () => {
    expect(detectParserType('data.zip')).toBe('shapefile')
  })

  it('is case-insensitive', () => {
    expect(detectParserType('DATA.GEOJSON')).toBe('geojson')
    expect(detectParserType('DATA.ZIP')).toBe('shapefile')
  })

  it('returns null for unsupported extensions', () => {
    expect(detectParserType('data.csv')).toBe(null)
    expect(detectParserType('data.txt')).toBe(null)
  })

  it('returns null for a file with no extension', () => {
    expect(detectParserType('data')).toBe(null)
  })

  it('returns null for undefined/empty input', () => {
    expect(detectParserType(undefined)).toBe(null)
    expect(detectParserType('')).toBe(null)
  })
})

describe('parseExposureFile — Shapefile reprojection (non-WGS84 .prj)', () => {
  it('reprojects a shapefile with a UTM 33N .prj to WGS84 lon/lat', async () => {
    // 500000/4649776 is a UTM 33N point (central meridian, ~42N) — well outside
    // valid WGS84 lon/lat bounds if left untransformed.
    const buffer = await buildShapefileZip({ prj: UTM33N_PRJ, x: 500000, y: 4649776 })
    const file = fileStub('utm.zip', buffer)

    const result = await parseExposureFile(file)

    expect(result.type).toBe('FeatureCollection')
    const [lon, lat] = result.features[0].geometry.coordinates
    // shpjs bundles proj4 and reprojects using the .prj at parse time, so the
    // output is already WGS84 — well within valid lon/lat bounds.
    expect(lon).toBeGreaterThan(-180)
    expect(lon).toBeLessThan(180)
    expect(lat).toBeGreaterThan(-90)
    expect(lat).toBeLessThan(90)
    expect(lon).toBeCloseTo(15, 1)
    expect(lat).toBeCloseTo(42, 1)
  })

  it('leaves coordinates untransformed (and out of WGS84 bounds) when no .prj is present', async () => {
    const buffer = await buildShapefileZip({ x: 500000, y: 4649776 })
    const file = fileStub('no-prj.zip', buffer)

    const result = await parseExposureFile(file)

    const [x, y] = result.features[0].geometry.coordinates
    // No .prj means no transform is applied — raw projected coordinates pass
    // through as-is, which the backend's WGS84 bounds check then rejects.
    expect(x).toBe(500000)
    expect(y).toBe(4649776)
  })
})
