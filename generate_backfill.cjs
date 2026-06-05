const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'src', 'configs', 'countries.json');
const outputPath = path.join(__dirname, 'supabase', 'migrations', '20260603_backfill_country_code.sql');

const data = require(dataPath);

const tables = [
  'earthquake', 'wildfire', 'flood', 'drought', 'food_security', 
  'tsunami', 'cyclone', 'volcano', 'epidemic', 'disaster'
];

// Sort countries by bbox area ascending
const sortedCountries = Object.entries(data).map(([code, info]) => {
  const { minLat, maxLat, minLng, maxLng } = info.bbox;
  // Calculate approximate area
  const area = Math.abs(maxLat - minLat) * Math.abs(maxLng - minLng);
  return { code, bbox: info.bbox, area };
}).sort((a, b) => a.area - b.area);

let sql = '-- =====================================================\n';
sql += '-- Backfill country_code based on lat/lng bboxes\n';
sql += '-- Sorted by bbox area ascending to prioritize smaller countries in overlapping zones.\n';
sql += '-- =====================================================\n\n';

let statementsCount = 0;

for (const table of tables) {
  for (const country of sortedCountries) {
    const { minLat, maxLat, minLng, maxLng } = country.bbox;
    sql += `UPDATE ${table}\n`;
    sql += `SET country_code = '${country.code}'\n`;
    sql += `WHERE country_code IS NULL\n`;
    sql += `  AND lat BETWEEN ${minLat} AND ${maxLat}\n`;
    sql += `  AND lng BETWEEN ${minLng} AND ${maxLng};\n\n`;
    statementsCount++;
  }
}

fs.writeFileSync(outputPath, sql);
console.log(`Generated ${statementsCount} UPDATE statements.`);
console.log(`Saved to ${outputPath}`);
