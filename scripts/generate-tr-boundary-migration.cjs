// One-off generator: embeds the bundled Turkey ADM1 boundary GeoJSON into a
// SQL migration that upserts it into country_boundaries, so 'tr' has a DB
// row like every other admin-uploaded country (previously it only worked via
// the bundled-file fallback in src/data/boundaries/index.js).
const fs = require('fs');
const path = require('path');

const geojsonPath = path.join(__dirname, '..', 'src', 'data', 'boundaries', 'tr-provinces.json');
const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260706220000_seed_tr_country_boundary.sql');

const geojson = fs.readFileSync(geojsonPath, 'utf8');
const tag = 'tr_geojson_2026_07_06';
if (geojson.includes(`$${tag}$`)) {
  throw new Error('Dollar-quote tag collision, pick a different tag');
}

const sql = `-- =====================================================
-- Seed the Turkey (tr) row into country_boundaries so it has a DB-backed
-- entry like every admin-uploaded country (e.g. Malaysia), instead of only
-- working through the bundled-file fallback in
-- src/data/boundaries/index.js. Turkey is used as the reference/example
-- country in demos, so it should behave identically to an admin-uploaded one.
-- Content is the same official geoBoundaries-TUR-ADM1_simplified.geojson
-- (81 features, properties.shapeName) already bundled in the frontend.
-- =====================================================

INSERT INTO country_boundaries (country_code, name_property, geojson)
VALUES (
  'tr',
  'shapeName',
  $${tag}$${geojson}$${tag}$::jsonb
)
ON CONFLICT (country_code) DO UPDATE
  SET name_property = EXCLUDED.name_property,
      geojson = EXCLUDED.geojson,
      updated_at = now();
`;

fs.writeFileSync(outPath, sql, 'utf8');
console.log('Wrote', outPath, `(${(sql.length / 1024).toFixed(1)} KB)`);
