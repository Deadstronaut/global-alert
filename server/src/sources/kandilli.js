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

export function startKandilli(onEvent, opts = {}) {
  const url = opts.url || URL;
  const intervalMs = opts.intervalMs || POLL_INTERVAL;
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(url, {
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
  timer = setInterval(() => {if (running) poll();}, intervalMs);
  console.log(`[Kandilli] ✅ Polling started (${intervalMs / 1000}s)`);

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
    // Bug fix (2026-08-20, user-reported: title showed "MNaN - ...", and
    // separately every recent Kandilli event's magnitude was silently 0).
    // Kandilli reports "-.-" for a magnitude type it hasn't computed for a
    // given event — true for MD (duration magnitude) and Mw (moment
    // magnitude) on nearly every small/local Turkish quake, where only ML
    // (local/Richter) is ever actually populated. "-.-" matches this
    // regex's own [\d.-]+ capture group (it's just dots/hyphens), so
    // parseFloat('-.-') is NaN — and Math.max(NaN, ml, NaN) is ALWAYS NaN
    // regardless of a perfectly valid ml, since Math.max propagates a
    // single NaN input to the result. That NaN used to leak straight into
    // the title ("MNaN"); it was ALSO overwriting a real, known magnitude
    // (e.g. ML 1.0) with a stored 0 — the more serious half of this bug,
    // silently zeroing out real magnitude data for virtually every
    // Turkish earthquake this source reported. Fixed by taking the max of
    // only the finite candidates instead of feeding NaN into Math.max.
    const magCandidates = [parseFloat(md), parseFloat(ml), parseFloat(ms)].filter((v) => !isNaN(v));
    const displayMag = magCandidates.length ? Math.max(...magCandidates) : 0;
    const isoTime = `${date.replace(/\./g, '-')}T${time}`;
    const id = `kandilli-${date}-${time}-${lat}-${lng}`;

    events.push(normalize({
      id,
      type: 'earthquake',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      magnitude: displayMag,
      depth: parseFloat(depth),
      title: `M${displayMag.toFixed(1)} - ${loc.trim()}`,
      description: `M${displayMag.toFixed(1)} ${loc.trim()} | Derinlik: ${depth}km`,
      time: isoTime,
      source: 'Kandilli',
      sourceUrl: 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',
      extra: {depth: parseFloat(depth), md: parseFloat(md), ml: parseFloat(ml), ms: parseFloat(ms), location: loc.trim()}
    }));
  }

  return events;
}
