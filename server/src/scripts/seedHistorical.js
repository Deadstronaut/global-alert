import dotenv from 'dotenv';
import {fileURLToPath} from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.join(__dirname, '../../.env')});

import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function writeBatch(events) {
    const chunkSize = 200;

    // Group events by table type
    const groups = {};
    for (const e of events) {
        if (!groups[e.type]) groups[e.type] = [];
        groups[e.type].push(e);
    }

    for (const [table, tableEvents] of Object.entries(groups)) {
        for (let i = 0; i < tableEvents.length; i += chunkSize) {
            const chunk = tableEvents.slice(i, i + chunkSize);
            // Fallback table handling just like supabaseWriter.js
            let {error} = await supabase.from(table).upsert(chunk, {onConflict: 'id'});

            if (error && error.code === '42P01') {
                // If specific table doesn't exist, try inserting to 'disaster'
                const fallback = await supabase.from('disaster').upsert(chunk, {onConflict: 'id'});
                error = fallback.error;
            }

            if (error) {
                console.error(`Batch write error for ${table}:`, error.message);
            } else {
                console.log(`Saved ${chunk.length} / ${tableEvents.length} events to [${table}]...`);
            }
        }
    }
}

async function seedUSGS() {
    console.log("Fetching 20+ Years of Earthquakes & Tsunamis from USGS (Since 2004)...");
    const startYear = 2004;
    const endYear = new Date().getFullYear();
    const mapped = [];

    for (let year = startYear; year <= endYear; year++) {
        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${year}-01-01&endtime=${year + 1}-01-01&minmagnitude=5.5&limit=20000`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!data.features) continue;

            for (const f of data.features) {
                let type = 'earthquake';
                // Hatay earthquake or others triggering a tsunami warning
                if (f.properties.tsunami === 1 || f.properties.tsunami === "1") {
                    type = 'tsunami';
                }

                mapped.push({
                    id: `usgs-${f.id}`,
                    source: 'USGS',
                    type: type,
                    title: f.properties.title,
                    magnitude: f.properties.mag,
                    depth: f.geometry?.coordinates?.[2] || 0,
                    lat: f.geometry?.coordinates?.[1] || 0,
                    lng: f.geometry?.coordinates?.[0] || 0,
                    time: new Date(f.properties.time).toISOString(),
                    source_url: f.properties.url,
                    severity: f.properties.mag >= 7.5 ? 'critical' : (f.properties.mag >= 6.5 ? 'high' : 'moderate')
                });
            }
            console.log(`- Fetched ${data.features.length} records for USGS year ${year}`);
        } catch (e) {
            console.error(`- USGS Error in ${year}:`, e.message);
        }
    }

    await writeBatch(mapped);
    console.log(`✅ Seeded ${mapped.length} Earthquakes/Tsunamis from USGS.`);
}

async function seedGDACS() {
    console.log("Fetching 20+ Years from GDACS by month (Since 2004)...");
    const startYear = 2004;
    const endYear = new Date().getFullYear();

    const validTypes = {
        'VO': 'volcano',
        'TC': 'cyclone',
        'FL': 'flood',
        'DR': 'drought',
        'WF': 'wildfire',
        'EQ': 'earthquake',
        'EP': 'epidemic'
    };

    const mapped = [];

    for (let year = startYear; year <= endYear; year++) {
        let monthlyCount = 0;
        for (let month = 1; month <= 12; month++) {
            // Stop if attempting to fetch future months
            if (year === endYear && month > new Date().getMonth() + 1) break;

            const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const toMonth = month === 12 ? 1 : month + 1;
            const toYear = month === 12 ? year + 1 : year;
            const toDate = `${toYear}-${String(toMonth).padStart(2, '0')}-01`;

            const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${fromDate}&toDate=${toDate}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (!data?.features) continue;

                monthlyCount += data.features.length;

                for (const f of data.features) {
                    const p = f.properties;
                    if (!validTypes[p.eventtype]) continue;

                    let sev = 'moderate';
                    if (p.alertlevel === 'Red') sev = 'critical';
                    if (p.alertlevel === 'Orange') sev = 'high';
                    if (p.alertlevel === 'Green') sev = 'low';

                    mapped.push({
                        id: `gdacs-${p.eventid}-${p.episodeid}`,
                        source: 'GDACS',
                        type: validTypes[p.eventtype],
                        title: p.eventname || p.name,
                        magnitude: p.severitydata?.severity || null,
                        depth: null,
                        lat: f.geometry?.coordinates?.[1] || 0,
                        lng: f.geometry?.coordinates?.[0] || 0,
                        time: new Date(p.fromdate).toISOString(),
                        source_url: p.url?.link || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`,
                        severity: sev
                    });
                }
            } catch (e) {
                console.error(`- GDACS Error for ${fromDate}:`, e.message);
            }
        }
        console.log(`- Fetched ${monthlyCount} GDACS records for year ${year}`);
    }

    await writeBatch(mapped);
    console.log(`✅ Seeded ${mapped.length} Volcanos, Cyclones, Floods, Droughts from GDACS.`);
}

async function run() {
    console.log("🚀 Starting Historical Data Seed...");
    await seedUSGS();
    await seedGDACS();
    console.log("🎉 All done! You now have 20 years of historical data.");
    process.exit(0);
}

run();
