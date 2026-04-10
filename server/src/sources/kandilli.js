/**
 * Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü (KOERI/BDTIM)
 * Scraping: http://www.koeri.boun.edu.tr/scripts/lasteq.asp
 * Türkiye için en hızlı kaynaklardan biri
 */

import axios from 'axios';
import {load} from 'cheerio';
import {normalize} from '../processors/normalizer.js';
import {reportStatus} from '../output/healthTracker.js';

let _poll = null;
export function triggerPollKandilli() {return _poll?.();}

const URL = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';
const POLL_INTERVAL = 20 * 1000; // 20 saniye

export function startKandilli(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(URL, {
        timeout: 15000,
        headers: {'Accept-Charset': 'windows-1254'},
        responseType: 'arraybuffer',
      });

      // Türkçe karakter desteği
      const decoder = new TextDecoder('windows-1254');
      const html = decoder.decode(res.data);
      const events = parseKandilli(html);

      let count = 0;
      for (const e of events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        onEvent(e);
        count++;
      }
      reportStatus('Kandilli', res.status, count);
    } catch (err) {
      reportStatus('Kandilli', err.response?.status || 0);
      console.warn('[Kandilli] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => {if (running) poll();}, POLL_INTERVAL);
  console.log('[Kandilli] ✅ Polling started (20s)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function parseKandilli(html) {
  const events = [];
  const $ = load(html);
  const pre = $('pre').text();
  if (!pre) return events;

  const lines = pre.split('\n');
  // Kandilli formatı: YYYY.MM.DD HH:MM:SS LAT LON DEPTH MD ML MS TYPE LOCATION
  const lineRe = /(\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+\w+\s+(.*)/;

  for (const line of lines) {
    const m = line.trim().match(lineRe);
    if (!m) continue;

    const [, date, time, lat, lng, depth, md, ml, ms, loc] = m;
    const mag = Math.max(parseFloat(md), parseFloat(ml), parseFloat(ms));
    const isoTime = `${date.replace(/\./g, '-')}T${time}`;
    const id = `kandilli-${date}-${time}-${lat}-${lng}`;

    events.push(normalize({
      id,
      type: 'earthquake',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      magnitude: isNaN(mag) ? 0 : mag,
      depth: parseFloat(depth),
      title: `M${mag.toFixed(1)} - ${loc.trim()}`,
      description: `M${mag.toFixed(1)} ${loc.trim()} | Derinlik: ${depth}km`,
      time: isoTime,
      source: 'Kandilli',
      sourceUrl: 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',
      extra: {depth: parseFloat(depth), md: parseFloat(md), ml: parseFloat(ml), ms: parseFloat(ms), location: loc.trim()}
    }));
  }

  return events;
}
