// Basic SSRF-shaped safety check for admin-registered map layer endpoints
// (spec 012 FR-002, mirrors SRS MHEWS-FC-INV-09). Rejects non-HTTPS URLs
// and hostnames that resolve to loopback, private, or link-local ranges.
// This is a static hostname/IP-shape check, not a live reachability probe
// (see research.md for why a live probe is the wrong tool for SSRF protection).

function isPrivateOrLoopbackHost(hostname) {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host === '::1' || host === '[::1]') return true

  // IPv4 dotted-quad checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [o1, o2] = ipv4.slice(1).map(Number)
    if (o1 === 127) return true // loopback 127.0.0.0/8
    if (o1 === 10) return true // private 10.0.0.0/8
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true // private 172.16.0.0/12
    if (o1 === 192 && o2 === 168) return true // private 192.168.0.0/16
    if (o1 === 169 && o2 === 254) return true // link-local 169.254.0.0/16
    return false
  }

  return false
}

export function isSafeLayerEndpointUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (isPrivateOrLoopbackHost(parsed.hostname)) return false

  return true
}
