# Contract: CAP v1.2 Envelope & Export

No REST API layer exists for this project. This contract documents the enforced DB behavior and
the pure-function export contract.

## Trigger: `set_cap_sender()` — `BEFORE INSERT ON cap_drafts`

**Behavior**: `NEW.sender := COALESCE(org.name, 'GEWS') || '@' || lower(COALESCE(NEW.country_code,
'global')) || '.gews.local'`, where `org` is looked up via `NEW.org_id` when present.

**Client contract**: no client code sets `sender` explicitly; it is always computed server-side.

## Modified: `guard_cap_draft_transition()` completeness gate (spec 006, extended)

**Before (spec 006)**: entering `pending_approval` requires non-blank `title`, `description`,
`instructions`, `area_desc`, `severity`, `certainty`, `urgency`, `hazard_type`.

**After (this spec)**: the same check additionally requires non-blank `sender` — in practice
always true given `set_cap_sender()`, but enforced as defense-in-depth (FR-002).

## Modified: `guard_cap_draft_transition()` — `broadcast_at` set-once (new)

**Behavior**: whenever `OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'broadcast' AND
OLD.broadcast_at IS NULL`, set `NEW.broadcast_at := NOW()`.

**Why this exists**: `status` alone cannot answer "was this alert ever actually broadcast?" — the
state machine allows `cancelled` to be reached directly from `draft`/`pending_approval`/`approved`
without ever passing through `broadcast`. `broadcast_at` is the authoritative, never-cleared
signal the export UI must check instead of inspecting `status`.

## Pure functions: `src/lib/capExport.js`

### `capMsgType(draft)`

```text
if draft.status in ('cancelled', 'false_alarm', 'all_clear'): return 'Cancel'
else if draft.supersedes_id is set: return 'Update'
else: return 'Alert'
```

### `generateCapXml(draft, supersededDraft)`

Returns a CAP v1.2-compliant XML string:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>{draft.id}</identifier>
  <sender>{draft.sender}</sender>
  <sent>{draft.created_at, CAP date-time format}</sent>
  <status>{"Exercise" if draft.is_exercise else "Actual"}</status>
  <msgType>{capMsgType(draft)}</msgType>
  <scope>Public</scope>
  <!-- <references> only present when supersededDraft is non-null -->
  <references>{supersededDraft.sender},{supersededDraft.id},{supersededDraft.effective_at}</references>
  <info>
    <category>{category derived from draft.hazard_type}</category>
    <event>{draft.hazard_type}</event>
    <urgency>{draft.urgency}</urgency>
    <severity>{draft.severity}</severity>
    <certainty>{draft.certainty}</certainty>
    <effective>{draft.effective_at, CAP date-time format}</effective>
    <expires>{draft.expires_at, CAP date-time format}</expires>
    <headline>{draft.title}</headline>
    <description>{draft.description}</description>
    <instruction>{draft.instructions}</instruction>
    <area>
      <areaDesc>{draft.area_desc}</areaDesc>
    </area>
  </info>
</alert>
```

All user-supplied text fields (`title`, `description`, `instructions`, `area_desc`) are XML-escaped
(`&`, `<`, `>`, `"`, `'`) before insertion.

### `generateCapJson(draft, supersededDraft)`

Returns a plain JS object with the same fields as above (camelCase keys), suitable for
`JSON.stringify()` and download as `.json`.

## UI contract: `CapView.vue`

- "Export XML" / "Export JSON" buttons appear on a draft card only when `draft.broadcast_at IS NOT
  NULL` (FR-004) — this is the sole condition, deliberately not inferred from `status`, since a
  `cancelled` alert may or may not have ever been broadcast (see `broadcast_at`'s contract above).
- When `draft.supersedes_id` is set, the component fetches that single superseded draft's
  `sender`/`id`/`effective_at` before generating the export (a small, targeted query — not a bulk
  fetch of all drafts).
- Clicking either button triggers a browser file download (`.xml` or `.json`) named after the
  draft's `id` and export type.
