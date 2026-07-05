const fs = require('fs');
const path = require('path');

const countries = require('../src/configs/countries.json');
const rows = Object.entries(countries)
  .filter(([, c]) => c.bbox)
  .map(([code, c]) => `  ('${code}', ${c.bbox.minLat}, ${c.bbox.maxLat}, ${c.bbox.minLng}, ${c.bbox.maxLng})`)
  .join(',\n');

const tables = ['earthquake', 'wildfire', 'flood', 'drought', 'food_security',
                 'tsunami', 'cyclone', 'volcano', 'epidemic', 'disaster'];

const updates = tables.map((t) => `
UPDATE ${t} d
SET country_code = m.code
FROM country_bbox_tmp m
WHERE d.country_code IS NULL
  AND d.lat BETWEEN m.min_lat AND m.max_lat
  AND d.lng BETWEEN m.min_lng AND m.max_lng
  AND m.area = (
    SELECT MIN(m2.area) FROM country_bbox_tmp m2
    WHERE d.lat BETWEEN m2.min_lat AND m2.max_lat
      AND d.lng BETWEEN m2.min_lng AND m2.max_lng
  );`).join('\n');

const sql = `-- =====================================================
-- One-off backfill: resolve country_code for pre-existing disaster rows
-- (rows inserted before the Aggregator started auto-resolving it — see
-- server/src/processors/geoCountry.js). Same bounding-box data, same
-- smallest-area-wins tie-break for overlapping countries.
-- Safe to re-run: only ever touches rows where country_code IS NULL.
-- =====================================================

CREATE TEMP TABLE country_bbox_tmp (
  code TEXT,
  min_lat DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  area DOUBLE PRECISION GENERATED ALWAYS AS ((max_lat - min_lat) * (max_lng - min_lng)) STORED
);

INSERT INTO country_bbox_tmp (code, min_lat, max_lat, min_lng, max_lng) VALUES
${rows};
${updates}

DROP TABLE country_bbox_tmp;
`;

fs.writeFileSync(path.resolve(__dirname, '../supabase/migrations/20260704_backfill_country_code.sql'), sql);
console.log('Wrote migration with', tables.length, 'table updates and', rows.split('\n').length, 'countries');
