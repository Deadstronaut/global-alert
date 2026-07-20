/**
 * Minimal, dependency-free ZIP extractor for the one thing this codebase
 * needs: pulling a single named-by-extension entry out of a small
 * (well under 4GB, no ZIP64) zip archive using only Web-standard APIs
 * (DecompressionStream('deflate-raw') — ZIP entries are raw DEFLATE, no
 * zlib/gzip wrapper).
 *
 * A full ZIP64 implementation was attempted first (spec 044's Meta/HDX
 * Population attempt) via the `fflate` npm package, but its esm.sh bundle
 * failed to deploy ("Unknown built-in 'node:vm' module") and Meta's actual
 * files turned out to need ZIP64 (>4GB uncompressed) anyway — abandoned,
 * see 20260720160000_meta_hdx_population_exposure_source.sql. GHSL's
 * global raster zip is ~461MB, comfortably non-ZIP64, so this simpler
 * hand-rolled local-file-header parser (live-verified against the real
 * file, 2026-07-20) is sufficient and avoids that dependency entirely.
 */

const LOCAL_FILE_HEADER_SIG = 0x04034b50

/**
 * Extracts the first entry whose name ends with `extension` (case-
 * insensitive) from a ZIP archive. Scans local file headers sequentially
 * from the start of the buffer — correct for the small, few-entry archives
 * this is used for; not a general-purpose ZIP reader (no central-directory
 * lookup, no ZIP64 support — throws explicitly if a 0xFFFFFFFF ZIP64
 * sentinel is encountered rather than silently misreading it).
 */
export async function extractFirstEntryByExtension(zipBuffer: ArrayBuffer, extension: string): Promise<ArrayBuffer> {
  const view = new DataView(zipBuffer)
  const bytes = new Uint8Array(zipBuffer)
  const ext = extension.toLowerCase()

  let offset = 0
  while (offset < zipBuffer.byteLength - 4) {
    if (view.getUint32(offset, true) !== LOCAL_FILE_HEADER_SIG) break

    const compressionMethod = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)

    if (compressedSize === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported by this minimal extractor')
    }

    const nameStart = offset + 30
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize

    if (name.toLowerCase().endsWith(ext)) {
      const compressed = bytes.subarray(dataStart, dataEnd)
      if (compressionMethod === 0) {
        return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
      }
      if (compressionMethod === 8) {
        const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream('deflate-raw'))
        return await new Response(stream).arrayBuffer()
      }
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`)
    }

    offset = dataEnd
  }

  throw new Error(`No entry ending in "${extension}" found in ZIP`)
}
