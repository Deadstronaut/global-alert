// One-off generator: embeds the bundled district (ADM2/ilçe) boundary
// GeoJSON for tr/my/mg into a SQL migration that seeds country_boundaries at
// level='district' — same pattern as generate-tr-boundary-migration.cjs did
// for the province level, extended to the (country_code, level) composite
// PK added by 20260727040000_country_boundaries_level.sql. Needed so
// server-side edge functions (which can't import the frontend's bundled JSON
// files directly) can look up a feature's containing district via a plain
// DB query, same as the client already does.
const fs = require('fs');
const path = require('path');

const COUNTRIES = [
  { code: 'tr', file: 'tr-districts.json' },
  { code: 'my', file: 'my-districts.json' },
  { code: 'mg', file: 'mg-districts.json' },
];

for (const { code, file } of COUNTRIES) {
  const geojsonPath = path.join(__dirname, '..', 'src', 'data', 'boundaries', file);
  const outPath = path.join(
    __dirname, '..', 'supabase', 'migrations',
    `20260729092000_seed_${code}_district_boundary.sql`,
  );

  const geojson = fs.readFileSync(geojsonPath, 'utf8');
  const tag = `${code}_district_geojson_2026_07_29`;
  if (geojson.includes(`$${tag}$`)) {
    throw new Error(`Dollar-quote tag collision for ${code}, pick a different tag`);
  }

  const sql = `-- =====================================================
-- Seed the ${code} district (ADM2/ilçe) row into country_boundaries at
-- level='district' — same content as the bundled
-- src/data/boundaries/${file} the frontend already falls back to, but as a
-- real DB row so server-side code (edge functions can't import the
-- frontend's bundled JSON files) can look it up too. Used by
-- writeExposureDataset.ts to tag each imported feature with its containing
-- district (admin_boundary_code) for the Impact Analysis boundary breakdown.
-- =====================================================

INSERT INTO country_boundaries (country_code, level, name_property, geojson)
VALUES (
  '${code}',
  'district',
  'shapeName',
  $${tag}$${geojson}$${tag}$::jsonb
)
ON CONFLICT (country_code, level) DO UPDATE
  SET name_property = EXCLUDED.name_property,
      geojson = EXCLUDED.geojson,
      updated_at = now();
`;

  fs.writeFileSync(outPath, sql, 'utf8');
  console.log('Wrote', outPath, `(${(sql.length / 1024).toFixed(1)} KB)`);
}
