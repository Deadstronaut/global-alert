// Fallback seeder for country_boundaries (level='district') via the
// Supabase JS client + service role key, used when `supabase db push`'s
// large inline-SQL INSERT for these multi-MB GeoJSON blobs times out over
// the CLI's direct connection (observed live, 2026-07-29). Same target rows
// as generate-district-boundary-migrations.cjs's generated SQL — this is
// just a different transport for the identical upsert.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// No dotenv dependency in this repo — read .env by hand (simple KEY=VALUE
// lines only, matches this file's actual format) instead of adding a new
// package just for this one-off script.
for (const rawLine of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const line = rawLine.trim() // strips the trailing \r from CRLF line endings
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COUNTRIES = [
  { code: 'tr', file: 'tr-districts.json' },
  { code: 'my', file: 'my-districts.json' },
  { code: 'mg', file: 'mg-districts.json' },
];

for (const { code, file } of COUNTRIES) {
  const geojsonPath = path.join(__dirname, '..', 'src', 'data', 'boundaries', file);
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  console.log(`Upserting ${code} district boundary (${geojson.features?.length ?? '?'} features)...`);
  const { error } = await supabase
    .from('country_boundaries')
    .upsert(
      { country_code: code, level: 'district', name_property: 'shapeName', geojson },
      { onConflict: 'country_code,level' },
    );
  if (error) {
    console.error(`  FAILED for ${code}:`, error.message);
    process.exitCode = 1;
  } else {
    console.log(`  OK: ${code}`);
  }
}
