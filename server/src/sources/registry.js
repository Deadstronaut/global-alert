/**
 * Adapter registry — maps a data_sources.source_type value to the Tier-1
 * parser module that knows how to fetch/parse that specific upstream API.
 * Used by configuredSources.js so admin-edited data_sources rows (url,
 * poll_interval_seconds, is_active) can drive the SAME parser code that
 * server/src/index.js's static imports use, instead of duplicating it.
 *
 * mode: 'poll'    -> configuredSources.js drives cadence via row.poll_interval_seconds
 * mode: 'websocket' -> started once, never wrapped in a timer (real-time push)
 */

import { connectEMSC }    from './emsc.js';
import { startUSGS }      from './usgs.js';
import { startAFAD }      from './afad.js';
import { startKandilli }  from './kandilli.js';
import { startGEOFON }    from './geofon.js';
import { startGDACS }     from './gdacs.js';
import { startPTWC }      from './ptwc.js';
import { startNASAFirms } from './nasaFirms.js';
import { startWHO }       from './who.js';
import { startFEWSNET }   from './fewsnet.js';
import { startGDACSRSS, startPTWCRSS } from './rss.js';

export const SOURCE_REGISTRY = {
  emsc:       { mode: 'websocket', start: (onEvent, { url } = {}) => connectEMSC(onEvent, url ? { url } : undefined) },
  usgs:       { mode: 'poll', start: (onEvent, opts) => startUSGS(onEvent, opts) },
  afad:       { mode: 'poll', start: (onEvent, opts) => startAFAD(onEvent, opts) },
  kandilli:   { mode: 'poll', start: (onEvent, opts) => startKandilli(onEvent, opts) },
  geofon:     { mode: 'poll', start: (onEvent, opts) => startGEOFON(onEvent, opts) },
  gdacs_rest: { mode: 'poll', start: (onEvent, opts) => startGDACS(onEvent, opts) },
  gdacs_rss:  { mode: 'poll', start: (onEvent, opts) => startGDACSRSS(onEvent, opts) },
  ptwc_rest:  { mode: 'poll', start: (onEvent, opts) => startPTWC(onEvent, opts) },
  ptwc_rss:   { mode: 'poll', start: (onEvent, opts) => startPTWCRSS(onEvent, opts) },
  nasa_firms: {
    mode: 'poll',
    start: (onEvent, opts) => {
      if (!process.env.NASA_FIRMS_KEY) {
        console.warn('[Registry] NASA_FIRMS_KEY eksik, nasa_firms satırı atlanıyor');
        return () => {};
      }
      return startNASAFirms(onEvent, process.env.NASA_FIRMS_KEY, opts);
    },
  },
  who:        { mode: 'poll', start: (onEvent, opts) => startWHO(onEvent, opts) },
  fewsnet:    { mode: 'poll', start: (onEvent, opts) => startFEWSNET(onEvent, opts) },
};
