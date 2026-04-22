/**
 * Shared upsert helper for all Edge Functions.
 * Uses SERVICE_ROLE_KEY so it bypasses RLS.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { NormalizedEvent } from './normalize.ts'

// Table name = disaster type (matches existing DB schema)
const TABLE_MAP: Record<string, string> = {
  earthquake:    'earthquake',
  wildfire:      'wildfire',
  flood:         'flood',
  drought:       'drought',
  food_security: 'food_security',
  tsunami:       'tsunami',
  cyclone:       'cyclone',
  volcano:       'volcano',
  epidemic:      'epidemic',
  disaster:      'disaster',
}

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

/**
 * Upsert a batch of normalized events into their respective tables.
 * Groups by type, runs one upsert per table.
 * Returns { inserted, errors }
 */
export async function upsertEvents(events: NormalizedEvent[]): Promise<{
  inserted: number
  errors: string[]
}> {
  if (events.length === 0) return { inserted: 0, errors: [] }

  const supabase = getServiceClient()
  const errors: string[] = []
  let inserted = 0

  // Group by table
  const groups = new Map<string, NormalizedEvent[]>()
  for (const ev of events) {
    const table = TABLE_MAP[ev.type] ?? 'disaster'
    if (!groups.has(table)) groups.set(table, [])
    groups.get(table)!.push(ev)
  }

  for (const [table, rows] of groups) {
    const { error, count } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
      .select('id', { count: 'exact', head: true })

    if (error) {
      errors.push(`${table}: ${error.message}`)
      console.error(`[upsert] Error on ${table}:`, error.message)
    } else {
      inserted += count ?? rows.length
    }
  }

  return { inserted, errors }
}
