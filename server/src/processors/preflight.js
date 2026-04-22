/**
 * Preflight Check — Startup'ta tüm kaynak URL'lerini test eder.
 * Kaynakları durdurmaz, sadece durumu loglar ve reportStatus'u günceller.
 */

import { reportStatus } from '../output/healthTracker.js';

const SOURCES = [
  // name, url, type ('http' | 'ws')
  { name: 'USGS',      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', type: 'http' },
  { name: 'EMSC',      url: 'https://www.seismicportal.eu/standing_order/websocket',                       type: 'ws'   },
  { name: 'AFAD',      url: 'https://deprem.afad.gov.tr/apiv2/event/filter',                              type: 'http' },
  { name: 'Kandilli',  url: 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',                              type: 'http' },
  { name: 'GEOFON',    url: 'https://geofon.gfz-potsdam.de/fdsnws/event/1/query?limit=1&format=geojson',  type: 'http' },
  { name: 'GDACS',     url: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH',              type: 'http' },
  { name: 'PTWC',      url: 'https://www.tsunami.gov/events/rss.xml',                                    type: 'http' },
  { name: 'NASA FIRMS',url: 'https://firms.modaps.eosdis.nasa.gov',                                       type: 'http' },
  { name: 'FEWS NET',  url: 'https://fdw.fews.net/api/ipcpackage/',                                       type: 'http' },
  { name: 'WHO',       url: 'https://www.who.int/api/emergencies/diseaseoutbreaknews',                    type: 'http' },
];

async function checkHTTP(name, url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'MHEWS/1.0 preflight' },
    });
    // HEAD desteklenmeyebilir — 405 bile gelirse sunucu ayakta
    const ok = res.status < 500;
    reportStatus(name, ok ? res.status : res.status);
    return { name, ok, code: res.status };
  } catch (err) {
    reportStatus(name, 0);
    return { name, ok: false, code: 0, err: err.message };
  }
}

async function checkWS(name, url) {
  // WebSocket için HTTP karşılığına HEAD at
  const httpUrl = url.replace('wss://', 'https://').replace('ws://', 'http://');
  return checkHTTP(name, httpUrl);
}

export async function runPreflight() {
  console.log('\n[Preflight] Kaynak bağlantıları kontrol ediliyor...\n');

  const results = await Promise.allSettled(
    SOURCES.map(s => s.type === 'ws' ? checkWS(s.name, s.url) : checkHTTP(s.name, s.url))
  );

  let online = 0;
  for (const r of results) {
    const { name, ok, code, err } = r.value ?? {};
    const icon = ok ? '✅' : '❌';
    const detail = ok ? `HTTP ${code}` : (err ?? `HTTP ${code}`);
    console.log(`  ${icon}  ${(name ?? '?').padEnd(14)} ${detail}`);
    if (ok) online++;
  }

  console.log(`\n[Preflight] ${online}/${SOURCES.length} kaynak erişilebilir\n`);
  return online;
}
