import { describe, it, expect } from 'vitest'
import { detectParserType } from '@/utils/exposureFileParser.js'

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
