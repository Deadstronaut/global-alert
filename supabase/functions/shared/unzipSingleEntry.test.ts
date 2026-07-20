import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractFirstEntryByExtension } from './unzipSingleEntry.ts'

// Builds a minimal single-entry ZIP (local file header + data only, no
// central directory) — extractFirstEntryByExtension never reads the
// central directory, so this is a sufficient fixture.
async function buildZipEntry(name: string, content: Uint8Array, method: 0 | 8): Promise<ArrayBuffer> {
  let data = content
  if (method === 8) {
    const stream = new Blob([content]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    data = new Uint8Array(await new Response(stream).arrayBuffer())
  }

  const nameBytes = new TextEncoder().encode(name)
  const header = new Uint8Array(30 + nameBytes.length)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true) // local file header signature
  view.setUint16(4, 20, true) // version needed
  view.setUint16(6, 0, true) // flags
  view.setUint16(8, method, true) // compression method
  view.setUint16(10, 0, true) // mod time
  view.setUint16(12, 0, true) // mod date
  view.setUint32(14, 0, true) // crc32 (unchecked by our extractor)
  view.setUint32(18, data.length, true) // compressed size
  view.setUint32(22, content.length, true) // uncompressed size
  view.setUint16(26, nameBytes.length, true) // name length
  view.setUint16(28, 0, true) // extra length
  header.set(nameBytes, 30)

  const out = new Uint8Array(header.length + data.length)
  out.set(header, 0)
  out.set(data, header.length)
  return out.buffer
}

Deno.test('extractFirstEntryByExtension: extracts a stored (uncompressed) entry', async () => {
  const content = new TextEncoder().encode('hello geotiff bytes')
  const zip = await buildZipEntry('data.tif', content, 0)
  const extracted = await extractFirstEntryByExtension(zip, '.tif')
  assertEquals(new Uint8Array(extracted), content)
})

Deno.test('extractFirstEntryByExtension: extracts a deflate-compressed entry', async () => {
  const content = new TextEncoder().encode('hello geotiff bytes'.repeat(50))
  const zip = await buildZipEntry('nested/data.tif', content, 8)
  const extracted = await extractFirstEntryByExtension(zip, '.tif')
  assertEquals(new Uint8Array(extracted), content)
})

Deno.test('extractFirstEntryByExtension: extension match is case-insensitive', async () => {
  const content = new TextEncoder().encode('x')
  const zip = await buildZipEntry('DATA.TIF', content, 0)
  const extracted = await extractFirstEntryByExtension(zip, '.tif')
  assertEquals(new Uint8Array(extracted), content)
})

Deno.test('extractFirstEntryByExtension: throws when no matching entry exists', async () => {
  const content = new TextEncoder().encode('x')
  const zip = await buildZipEntry('data.csv', content, 0)
  await assertRejects(() => extractFirstEntryByExtension(zip, '.tif'), Error, 'No entry ending in ".tif"')
})

Deno.test('extractFirstEntryByExtension: throws explicitly on a ZIP64 sentinel rather than misreading it', async () => {
  const content = new TextEncoder().encode('x')
  const zip = await buildZipEntry('data.tif', content, 0)
  const view = new DataView(zip)
  view.setUint32(18, 0xffffffff, true) // force the ZIP64 sentinel
  await assertRejects(() => extractFirstEntryByExtension(zip, '.tif'), Error, 'ZIP64')
})
