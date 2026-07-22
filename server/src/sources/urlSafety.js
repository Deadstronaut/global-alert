/**
 * SSRF-safety wrapper for admin-registered custom source URLs
 * (dynamicSources.js's format handlers — the only place in server/ that
 * fetches a URL a country admin typed into the "Kaynak Ekle" panel, not a
 * hardcoded upstream). Three protections, each closing a distinct bypass:
 *
 * 1. Protocol + literal-IP check (ported from src/utils/mapLayerUrlSafety.js's
 *    isSafeLayerEndpointUrl — same private/loopback/link-local ranges,
 *    including 169.254.0.0/16 which covers cloud metadata endpoints).
 * 2. DNS-resolved IP check: the literal-IP check alone only catches a URL
 *    where the admin pasted a raw IP — a hostname (e.g. an attacker-owned
 *    domain) pointing at a private IP via DNS sails right through. We
 *    resolve the hostname and re-run the same range check against the
 *    resolved address before ever connecting.
 * 3. Redirects disabled entirely (axios: maxRedirects: 0 / fetch:
 *    redirect: 'manual'). A URL that passes checks 1-2 could still 302 to
 *    an internal address at request time — rather than re-validating every
 *    hop, we just refuse to follow any redirect at all. No currently
 *    configured or anticipated source needs one.
 *
 * NOT closed (accepted, documented — not a silent gap): true DNS-rebinding,
 * where an attacker flips a domain's DNS record between our lookup here and
 * the actual TCP connect a few milliseconds later. Closing that fully needs
 * pinning the validated IP through a custom connect/lookup at the socket
 * layer for both axios and undici's fetch — meaningfully more code for a
 * threat that requires the attacker to already be a trusted, authenticated
 * admin of a deployed customer. Given that threat model, this is a
 * conscious accept, not an oversight — revisit if the admin panel ever
 * opens to unvetted self-signup.
 */
import dns from 'node:dns'
import axios from 'axios'

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024 // 20MB — generous for a JSON/CSV/RSS hazard feed, not for an accidental/malicious dump

function isPrivateOrLoopbackIPv4(o1, o2) {
  if (o1 === 127) return true // loopback 127.0.0.0/8
  if (o1 === 10) return true // private 10.0.0.0/8
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true // private 172.16.0.0/12
  if (o1 === 192 && o2 === 168) return true // private 192.168.0.0/16
  if (o1 === 169 && o2 === 254) return true // link-local, incl. cloud metadata (169.254.169.254)
  if (o1 === 0) return true // 0.0.0.0/8
  return false
}

function isPrivateOrLoopbackHost(hostname) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [o1, o2] = ipv4.slice(1).map(Number)
    return isPrivateOrLoopbackIPv4(o1, o2)
  }
  // Conservative default for anything IPv6-shaped we don't explicitly parse
  // (fc00::/7 unique-local, fe80::/10 link-local) — reject rather than guess.
  if (host.includes(':')) {
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  }
  return false
}

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

/** Step 1 + 2: protocol, literal-IP shape, and DNS-resolved IP. Throws UnsafeUrlError, never returns false silently — callers must not swallow this. */
export async function assertSafeUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new UnsafeUrlError(`Malformed URL: ${url}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new UnsafeUrlError(`Only https:// URLs are allowed for custom sources, got: ${parsed.protocol}`)
  }
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new UnsafeUrlError(`Hostname resolves to a disallowed literal address: ${parsed.hostname}`)
  }

  const resolved = await dns.promises.lookup(parsed.hostname).catch(() => null)
  if (!resolved) {
    throw new UnsafeUrlError(`Could not resolve hostname: ${parsed.hostname}`)
  }
  if (resolved.family === 4) {
    const [o1, o2] = resolved.address.split('.').map(Number)
    if (isPrivateOrLoopbackIPv4(o1, o2)) {
      throw new UnsafeUrlError(`Hostname "${parsed.hostname}" resolves to a disallowed address: ${resolved.address}`)
    }
  } else if (isPrivateOrLoopbackHost(resolved.address)) {
    throw new UnsafeUrlError(`Hostname "${parsed.hostname}" resolves to a disallowed address: ${resolved.address}`)
  }

  return parsed
}

/** For json.js/geojson.js (axios-based handlers). */
export async function safeAxiosGet(url, options = {}) {
  await assertSafeUrl(url)
  return axios.get(url, {
    ...options,
    maxRedirects: 0,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
  })
}

/** For csv.js/rss.js/fdsn.js (native fetch-based handlers). */
export async function safeFetch(url, options = {}) {
  await assertSafeUrl(url)
  const res = await fetch(url, { ...options, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) {
    throw new UnsafeUrlError(`Refusing to follow redirect (HTTP ${res.status}) from custom source URL`)
  }
  return res
}

/** Reads a fetch Response's body as text, aborting once MAX_RESPONSE_BYTES is exceeded rather than buffering an unbounded body. */
export async function readTextWithLimit(res) {
  const contentLength = Number(res.headers.get('content-length') || 0)
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new UnsafeUrlError(`Response too large (Content-Length ${contentLength} bytes)`)
  }
  if (!res.body) return res.text()

  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new UnsafeUrlError(`Response exceeded ${MAX_RESPONSE_BYTES} byte limit`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8')
}
