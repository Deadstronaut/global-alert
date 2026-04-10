/**
 * WHO - World Health Organization Disease Outbreak News
 * API: https://www.who.int/api/emergencies/diseaseoutbreaknews
 * Kapsam: Salgın hastalıklar, outbreak uyarıları - GLOBAL
 */

import axios from 'axios';
import { normalize } from '../processors/normalizer.js';
import { reportStatus } from '../output/healthTracker.js';

const FEED_URL = 'https://www.who.int/api/emergencies/diseaseoutbreaknews';
const POLL_INTERVAL = 30 * 60 * 1000; // 30 dakika

// Ülke adı → yaklaşık koordinat (WHO RSS'de koordinat yok)
const COUNTRY_COORDS = {
  'Afghanistan': [33.9391, 67.7100], 'Angola': [-11.2027, 17.8739],
  'Bangladesh': [23.6850, 90.3563], 'Brazil': [-14.2350, -51.9253],
  'Cambodia': [12.5657, 104.9910], 'Cameroon': [3.8480, 11.5021],
  'Chad': [15.4542, 18.7322], 'China': [35.8617, 104.1954],
  'Colombia': [4.5709, -74.2973], 'Congo': [-0.2280, 15.8277],
  'Democratic Republic of the Congo': [-4.0383, 21.7587],
  'Egypt': [26.8206, 30.8025], 'Ethiopia': [9.1450, 40.4897],
  'Ghana': [7.9465, -1.0232], 'Guinea': [9.9456, -11.3247],
  'Haiti': [18.9712, -72.2852], 'India': [20.5937, 78.9629],
  'Indonesia': [-0.7893, 113.9213], 'Iraq': [33.2232, 43.6793],
  'Jordan': [30.5852, 36.2384], 'Kenya': [-0.0236, 37.9062],
  'Lebanon': [33.8547, 35.8623], 'Libya': [26.3351, 17.2283],
  'Madagascar': [-18.7669, 46.8691], 'Malawi': [-13.2543, 34.3015],
  'Mali': [17.5707, -3.9962], 'Mauritania': [21.0079, -10.9408],
  'Mexico': [23.6345, -102.5528], 'Mozambique': [-18.6657, 35.5296],
  'Myanmar': [21.9162, 95.9560], 'Nepal': [28.3949, 84.1240],
  'Niger': [17.6078, 8.0817], 'Nigeria': [9.0820, 8.6753],
  'Pakistan': [30.3753, 69.3451], 'Philippines': [12.8797, 121.7740],
  'Saudi Arabia': [23.8859, 45.0792], 'Senegal': [14.4974, -14.4524],
  'Sierra Leone': [8.4606, -11.7799], 'Somalia': [5.1521, 46.1996],
  'South Sudan': [6.8770, 31.3070], 'Sudan': [12.8628, 30.2176],
  'Syria': [34.8021, 38.9968], 'Tanzania': [-6.3690, 34.8888],
  'Thailand': [15.8700, 100.9925], 'Turkey': [38.9637, 35.2433],
  'Uganda': [1.3733, 32.2903], 'Ukraine': [48.3794, 31.1656],
  'United States': [37.0902, -95.7129], 'Venezuela': [6.4238, -66.5897],
  'Vietnam': [14.0583, 108.2772], 'Yemen': [15.5527, 48.5164],
  'Zambia': [-13.1339, 27.8493], 'Zimbabwe': [-19.0154, 29.1549],
};

let _poll = null;
export function triggerPollWHO() { return _poll?.(); }

export function startWHO(onEvent) {
  const seen = new Set();
  let timer = null;
  let running = true;

  async function poll() {
    try {
      const res = await axios.get(FEED_URL, {
        params: {
          sf_provider: 'dynamicProvider372',
          sf_culture: 'en',
          $orderby: 'PublicationDateAndTime desc',
          $expand: 'EmergencyEvent',
          $select: 'Title,TitleSuffix,OverrideTitle,UseOverrideTitle,regionscountries,ItemDefaultUrl,FormattedDate,PublicationDateAndTime',
        },
        timeout: 15000,
        responseType: 'json',
        headers: { 'User-Agent': 'GlobalAlert/1.0 (disaster monitoring)' },
      });

      const items = Array.isArray(res.data?.value) ? res.data.value : [];
      let count = 0;
      for (const item of items) {
        const id = `who-${item.ItemDefaultUrl || item.Title || item.PublicationDateAndTime}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const event = normalizeWHO(item, id);
        if (event) { onEvent(event); count++; }
      }
      reportStatus('WHO', res.status, count);
    } catch (err) {
      reportStatus('WHO', err.response?.status || 0);
      console.warn('[WHO] Poll error:', err.message);
    }
  }

  _poll = poll;
  poll();
  timer = setInterval(() => { if (running) poll(); }, POLL_INTERVAL);
  console.log('[WHO] ✅ Polling started (30 min)');

  return () => {
    running = false;
    clearInterval(timer);
  };
}

function normalizeWHO(item, id) {
  const title = (item.UseOverrideTitle ? item.OverrideTitle : item.Title) || item.Title || 'Disease Outbreak';
  const desc = `${item.FormattedDate || ''}`.trim();

  // Ülke koordinatı bul
  let lat = 0, lng = 0, country = '';
  for (const [name, coords] of Object.entries(COUNTRY_COORDS)) {
    if (title.includes(name) || desc.includes(name)) {
      [lat, lng] = coords;
      country = name;
      break;
    }
  }

  return normalize({
    id,
    type: 'epidemic',
    lat, lng,
    magnitude: 1,
    depth: 0,
    title: title.slice(0, 200),
    description: (desc || title).slice(0, 500),
    time: item.PublicationDateAndTime ? new Date(item.PublicationDateAndTime).toISOString() : new Date().toISOString(),
    source: 'WHO',
    sourceUrl: item.ItemDefaultUrl
      ? `https://www.who.int${item.ItemDefaultUrl}`
      : 'https://www.who.int/emergencies/disease-outbreak-news',
    extra: { country },
  });
}
