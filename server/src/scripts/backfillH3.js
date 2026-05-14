import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import * as h3 from 'h3-js';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  'earthquake',
  'wildfire',
  'flood',
  'drought',
  'tsunami',
  'cyclone',
  'volcano',
  'epidemic',
  'disaster'
];

const RESOLUTION = 7;

async function backfillTable(tableName) {
  console.log(`\n🚀 Starting backfill for table: [${tableName}]`);
  
  let totalProcessed = 0;
  let hasMore = true;
  const batchSize = 1000;

  while (hasMore) {
    // Fetch rows where h3_id is null
    const { data, error } = await supabase
      .from(tableName)
      .select('id, lat, lng')
      .is('h3_id', null)
      .limit(batchSize);

    if (error) {
      console.error(`Error fetching data from ${tableName}:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      console.log(`✅ All rows in [${tableName}] are already indexed.`);
      hasMore = false;
      break;
    }

    console.log(`Processing batch of ${data.length} rows...`);

    const updates = data.map(row => {
      const h3_id = h3.latLngToCell(row.lat, row.lng, RESOLUTION);
      return { id: row.id, h3_id };
    });

    const { error: updateError } = await supabase
      .from(tableName)
      .upsert(updates, { onConflict: 'id' });

    if (updateError) {
      console.error(`Error updating ${tableName}:`, updateError.message);
      break;
    }

    totalProcessed += data.length;
    console.log(`Indexed ${totalProcessed} rows so far...`);

    if (data.length < batchSize) {
      hasMore = false;
    }
  }

  console.log(`✨ Finished backfill for [${tableName}]. Total processed: ${totalProcessed}`);
}

async function run() {
  for (const table of TABLES) {
    await backfillTable(table);
  }
  console.log("\n🎉 Backfill complete for all tables!");
}

run();
