import {createClient} from '@supabase/supabase-js';

/**
 * API Configuration
 * All external API calls are proxied through Supabase Edge Functions
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mjvuzbpjyhhiwarjcvlm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Exported so callers that need to hand-build a fetch() request (e.g. the
// community-reports-stream SSE client, which can't use supabase.functions.invoke
// since it needs a streamed ReadableStream response) don't have to reach into
// the client's internal properties.
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;

/**
 * Supabase Edge Function URLs
 *
 * Live disaster data reaches the frontend via Supabase realtime
 * subscriptions (src/services/supabaseService.js), not by polling these
 * Edge Functions directly — the old poll-based fetchers
 * (fetch-earthquakes/wildfires/floods/droughts/food-security/historical-events
 * called through src/services/api/disasterService.js) were unused dead code
 * and removed 2026-07-22. Only the two user-triggered functions below are
 * still called directly (via supabase.functions.invoke or fetch) from
 * components.
 */
export const EDGE_FUNCTIONS = {
    // spec 039: user-triggered only, no polling interval (not scheduled).
    SIMULATE_HAZARD_SCENARIO: `${supabaseUrl}/functions/v1/simulate-hazard-scenario`,
    COMPUTE_RISK_EXCEEDANCE_CURVE: `${supabaseUrl}/functions/v1/compute-risk-exceedance-curve`
};
