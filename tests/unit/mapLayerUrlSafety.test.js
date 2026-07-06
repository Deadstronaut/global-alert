import { describe, it, expect } from 'vitest'
import { isSafeLayerEndpointUrl } from '@/utils/mapLayerUrlSafety.js'

describe('isSafeLayerEndpointUrl', () => {
  it('accepts a valid public HTTPS URL', () => {
    expect(isSafeLayerEndpointUrl('https://geoserver.example.gov/wms')).toBe(true)
  })

  it('accepts a valid public HTTPS URL with a public IP host', () => {
    expect(isSafeLayerEndpointUrl('https://8.8.8.8/wms')).toBe(true)
  })

  it('rejects non-HTTPS (http)', () => {
    expect(isSafeLayerEndpointUrl('http://geoserver.example.gov/wms')).toBe(false)
  })

  it('rejects localhost', () => {
    expect(isSafeLayerEndpointUrl('https://localhost/wms')).toBe(false)
  })

  it('rejects IPv6 loopback', () => {
    expect(isSafeLayerEndpointUrl('https://[::1]/wms')).toBe(false)
  })

  it('rejects 127.0.0.0/8 loopback', () => {
    expect(isSafeLayerEndpointUrl('https://127.0.0.1/wms')).toBe(false)
  })

  it('rejects 10.0.0.0/8 private range', () => {
    expect(isSafeLayerEndpointUrl('https://10.1.2.3/wms')).toBe(false)
  })

  it('rejects 172.16.0.0/12 private range', () => {
    expect(isSafeLayerEndpointUrl('https://172.20.5.5/wms')).toBe(false)
    expect(isSafeLayerEndpointUrl('https://172.15.5.5/wms')).toBe(true)
    expect(isSafeLayerEndpointUrl('https://172.32.5.5/wms')).toBe(true)
  })

  it('rejects 192.168.0.0/16 private range', () => {
    expect(isSafeLayerEndpointUrl('https://192.168.1.1/wms')).toBe(false)
  })

  it('rejects 169.254.0.0/16 link-local range', () => {
    expect(isSafeLayerEndpointUrl('https://169.254.1.1/wms')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isSafeLayerEndpointUrl('not-a-url')).toBe(false)
  })
})
