// Read-only hazard-event lookup tool for ai-chat's tool-calling loop (spec
// 051 addendum — "chat botun veritabanına ulaşması"). Strictly SELECT-only:
// this module never writes to any table, and the table name is resolved
// through a fixed whitelist (never interpolated from the model's raw
// output) so there is no path from a model's tool-call arguments to an
// arbitrary table read, let alone a write. Mirrors
// server/src/output/supabaseWriter.js's TABLE_MAP — same 5 hazard types the
// rest of the platform treats as the canonical set (data_sources.hazard_type
// CHECK constraint, ai-anomaly-check's HAZARD_TABLES).

export const HAZARD_TYPE_TABLES: Record<string, string> = {
  earthquake: 'earthquake',
  wildfire: 'wildfire',
  flood: 'flood',
  drought: 'drought',
  food_security: 'food_security',
}

const MIN_DAYS = 1
const MAX_DAYS = 90
const DEFAULT_DAYS = 14
const MAX_ROWS = 20

export const HAZARD_QUERY_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'get_recent_hazard_events',
    description:
      'Look up recent real hazard/disaster events from the platform\'s live database. Use this whenever a ' +
      'question depends on current, real data (e.g. "is there an earthquake near X", "any recent floods in Y") ' +
      'instead of guessing.',
    parameters: {
      type: 'object',
      properties: {
        hazard_type: {
          type: 'string',
          enum: Object.keys(HAZARD_TYPE_TABLES),
          description: 'Which kind of hazard to look up.',
        },
        country_code: {
          type: 'string',
          description: 'Optional 2-letter country code to filter by, e.g. "tr". Omit to search all countries.',
        },
        days: {
          type: 'integer',
          description: `How many days back to look (${MIN_DAYS}-${MAX_DAYS}, default ${DEFAULT_DAYS}).`,
        },
      },
      required: ['hazard_type'],
    },
  },
}

export interface HazardQueryArgs {
  hazard_type?: unknown
  country_code?: unknown
  days?: unknown
}

export type ResolvedHazardQuery =
  | { ok: true; table: string; countryCode: string | null; sinceIso: string }
  | { ok: false; error: string }

// Pure — validates/normalizes the model-supplied arguments against the
// whitelist before any query is built, so it's unit-testable without a live
// database (mirrors the codebase's "pure logic separated from the
// Deno.serve handler" convention, e.g. gdacsSplit.ts/aiSourcePermission.ts).
export function resolveHazardQuery(args: HazardQueryArgs, now: Date = new Date()): ResolvedHazardQuery {
  const hazardType = typeof args.hazard_type === 'string' ? args.hazard_type : null
  const table = hazardType ? HAZARD_TYPE_TABLES[hazardType] : undefined
  if (!table) {
    return { ok: false, error: `hazard_type must be one of: ${Object.keys(HAZARD_TYPE_TABLES).join(', ')}` }
  }

  let countryCode: string | null = null
  if (typeof args.country_code === 'string' && args.country_code.trim()) {
    countryCode = args.country_code.trim().toLowerCase().slice(0, 2)
  }

  let days = DEFAULT_DAYS
  const rawDays = typeof args.days === 'string' ? Number(args.days) : args.days
  if (typeof rawDays === 'number' && Number.isFinite(rawDays)) {
    days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(rawDays)))
  }

  const sinceIso = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  return { ok: true, table, countryCode, sinceIso }
}

export { MAX_ROWS }
