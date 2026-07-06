/**
 * Exposure dataset file parsing (spec 023) — detects whether an uploaded
 * file is GeoJSON or a Shapefile bundle and converts either into the same
 * GeoJSON FeatureCollection shape already sent to the unchanged
 * upload-exposure-dataset Edge Function (spec 008).
 */
import shp from 'shpjs';

// Pure function (research.md Decision 3, tested in
// tests/unit/exposureFileParser.test.js): extension-based format detection,
// case-insensitive. No separate user-facing format choice (FR-002).
export function detectParserType(fileName) {
  const name = String(fileName ?? '').toLowerCase();
  if (name.endsWith('.json') || name.endsWith('.geojson')) return 'geojson';
  if (name.endsWith('.zip')) return 'shapefile';
  return null;
}

export async function parseExposureFile(file) {
  const type = detectParserType(file?.name);
  if (!type) {
    throw new Error(`Unsupported file type: ${file?.name ?? '(unknown)'}. Only .geojson/.json or a Shapefile .zip are supported.`);
  }

  if (type === 'geojson') {
    const text = await file.text();
    return JSON.parse(text);
  }

  // type === 'shapefile'
  const buffer = await file.arrayBuffer();
  const result = await shp(buffer);
  // shpjs returns an array of FeatureCollections instead of a single one
  // when the .zip contains multiple .shp layers (analysis finding U1) —
  // reject clearly rather than passing an array through to the Edge
  // Function, which expects a single object with a `.features` array.
  if (Array.isArray(result)) {
    throw new Error('Multiple layers in one Shapefile bundle are not supported — upload a single-layer .zip.');
  }
  return result;
}
