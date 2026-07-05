# Contract: Audit & Compliance Viewer

All operations run as direct Supabase-JS calls from the authenticated super_admin session — no
Edge Function (research.md §5).

## Browse/filter (FR-001, FR-002, FR-003)

```js
let query = supabase.from('audit_log').select('*', { count: 'exact' })
if (filters.tableName) query = query.eq('table_name', filters.tableName)
if (filters.userId) query = query.eq('changed_by', filters.userId)
if (filters.action) query = query.eq('action', filters.action)
if (filters.from) query = query.gte('created_at', filters.from)
if (filters.to) query = query.lte('created_at', filters.to)
const { data, count, error } = await query
  .order('seq', { ascending: false })
  .range(offset, offset + pageSize - 1)
```

**Authorization**: existing `super_admin_read_audit` RLS policy — non-super_admin callers get an
empty result set (RLS-filtered), not an error, consistent with existing Supabase RLS behavior.

## Single-record history (FR-009)

```js
supabase.from('audit_log')
  .select('*')
  .eq('table_name', tableName)
  .eq('record_id', recordId)
  .order('seq', { ascending: true })
```

## Export (FR-004, FR-005)

```js
const { data } = await query.order('seq', { ascending: false }).limit(5000)
const capped = data.length === 5000 // inform user export may have been capped
// then, client-side (src/lib/auditExport.js):
rowsToCsv(data) // or rowsToJson(data)
triggerDownload(content, `audit-export-${Date.now()}.csv`, 'text/csv')
```

**Guard**: the same filters from the browse view are re-applied before the `.limit(5000)` call —
export always reflects the currently active filters, never the full unfiltered table.

## Integrity check (FR-007)

```js
const { data, error } = await supabase.rpc('verify_audit_chain')
// data === null -> chain intact
// data === <seq number> -> first broken row's seq
```

`verify_audit_chain()` is a `SECURITY DEFINER` Postgres function (research.md §4), callable via
RPC; wrap its own access check to super_admin only (mirroring `current_profile_role()` pattern
from spec 004) since RPC calls bypass table RLS by default for `SECURITY DEFINER` functions.
