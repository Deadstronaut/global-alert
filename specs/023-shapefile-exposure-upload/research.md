# Research: Shapefile Exposure Dataset Upload

## Decision 1: `shpjs` as the Shapefile-to-GeoJSON conversion library, client-side

**Decision**: Add `shpjs` as a new npm dependency, used entirely in the browser to convert a
`.zip` Shapefile bundle into a GeoJSON `FeatureCollection`, which is then handed to the exact same
upload code path (and therefore the exact same `upload-exposure-dataset` Edge Function payload)
already used for a directly-uploaded GeoJSON file.

**Rationale**: `shpjs` is the most widely used client-side (and Node-compatible) Shapefile parser
in the JS ecosystem, requires no server-side/Deno component, and converting to GeoJSON *before*
the existing upload call means the already-battle-tested `geojsonValidation.ts` and
`geometryToWkt()` Edge Function code (spec 008) apply completely unchanged — this is the smallest
possible surface area for the new capability, touching zero backend code. No other
shapefile-parsing dependency exists in this project today (confirmed absent from `package.json`),
so this is a net-new, single, well-justified addition (Constitution Principle VIII).

**Alternatives considered**: A Deno-side Shapefile parser inside the Edge Function (accepting raw
`.zip` bytes and converting server-side): rejected — Deno-compatible Shapefile-parsing libraries
are far less mature/maintained than the browser/Node JS ecosystem's `shpjs`, and this approach
would require modifying `upload-exposure-dataset/index.ts` (a working, spec-008-validated
function), increasing risk for no benefit over doing the conversion client-side before the
existing call.

## Decision 2: No coordinate reprojection — rely on existing WGS84 validation to reject non-WGS84 input

**Decision**: `shpjs` reads a Shapefile's coordinates as-is; it does not reproject based on the
bundle's `.prj` file. If a Shapefile's coordinates are not already in WGS84 (EPSG:4326), the
existing `geojsonValidation.ts` WGS84 coordinate-range check (spec 008, unchanged) will reject the
resulting GeoJSON with its existing error message.

**Rationale**: Automatic reprojection would require a full coordinate-reference-system transform
library (e.g., `proj4js`) and reading/interpreting arbitrary `.prj`/WKT CRS definitions — a
meaningfully larger scope than "accept a second file format," and not something this spec's
acceptance criteria call for (FR-004 only requires a clear rejection, not correction). This
mirrors spec 008's own original GeoJSON scope, which likewise only ever accepted WGS84 and never
implemented reprojection.

**Alternatives considered**: Adding `proj4js`-based reprojection for common non-WGS84 CRSs:
rejected as significant added complexity and a new failure surface (ambiguous/missing `.prj`
files, unsupported CRS strings) for a need not established by this spec's scope (YAGNI).

## Decision 3: `detectParserType()` as the pure, tested selection function

**Decision**: Extract `detectParserType(fileName)` as a pure function in
`src/utils/exposureFileParser.js`, returning `'geojson'` for `.json`/`.geojson` (case-insensitive),
`'shapefile'` for `.zip`, and `null` for anything else (FR-002's "no separate user-facing format
choice" requirement, decided purely from the extension). `parseExposureFile(file)` is a thin async
wrapper that calls the right parser based on this pure function's result and rejects (throws) for
a `null` detection before attempting to read the file at all.

**Rationale**: Matches this project's established pure-function-extraction pattern (spec
010/019/020/021/022's own pure functions) — the file-extension-to-parser mapping is the one part
of this feature with distinct branches worth testing without needing a real File object or a real
Shapefile ZIP fixture.

**Alternatives considered**: Branching directly on `file.name.endsWith(...)` inline inside
`ExposureDatasetManager.vue`'s `upload()` function: rejected only because it would then require a
mounted-component test (or a real `File` object encoded in a test) to exercise the "unsupported
extension" edge case, whereas a hoisted, pure, string-in/string-out function tests trivially.
