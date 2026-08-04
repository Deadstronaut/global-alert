# Phase 1 Data Model: Shadcn UI Migration

This feature has no persisted/runtime data model (no database rows, no Pinia store shape
changes, no API payloads). The "entities" here are process/tracking artifacts, not application
data — captured for planning traceability per the spec's Key Entities section.

## UI Component Migration Record

Tracks the migration status of each hand-written UI component/pattern. Not persisted in code or
a database — maintained as this plan's living checklist (see `tasks.md` once generated, and the
priority list in `spec.md` → Assumptions).

| Field | Description |
|---|---|
| `name` | Component or pattern identifier (e.g. "Sidebar settings/dashboard buttons", "SettingsPanel dialog shell") |
| `tier` | One of: atom (button/icon-button), composite-dialog, composite-form-control, composite-panel |
| `status` | `not_started` \| `in_progress` \| `migrated` \| `verified` |
| `verified_themes` | Subset of {dark, light, high-contrast} confirmed visually correct |
| `verified_rtl` | boolean — confirmed correct under Arabic/RTL layout |
| `file(s)` | Repo-relative path(s) touched |

## Design Token Mapping

The alias table in `src/assets/main.css` connecting shadcn-vue's semantic tokens to this app's
existing palette. This is the single source of truth for shadcn theming — no code should ever
hardcode a shadcn token to a literal color.

| shadcn token | Aliased to | Notes |
|---|---|---|
| `--background` | `var(--color-bg)` | |
| `--foreground` | `var(--color-text-primary)` | |
| `--card`, `--popover` | `var(--color-panel)` | |
| `--card-foreground`, `--popover-foreground` | `var(--color-text-primary)` | |
| `--primary` | `var(--color-accent)` | |
| `--primary-foreground` | `var(--color-bg)` | dark text on the light-blue accent |
| `--secondary`, `--muted`, `--accent` (shadcn's, not the app's brand accent) | `var(--color-bg-soft)` | subtle hover/background surfaces |
| `--secondary-foreground`, `--accent-foreground` | `var(--color-text-primary)` | |
| `--muted-foreground` | `var(--color-text-muted)` | |
| `--destructive` | `var(--color-critical)` | |
| `--border`, `--input`, `--sidebar-border` | `var(--glass-border)` | |
| `--ring`, `--sidebar-ring` | `var(--color-accent)` | |
| `--chart-1..5` | `var(--color-earthquake)`, `var(--color-flood)`, `var(--color-wildfire)`, `var(--color-accent)`, `var(--color-drought)` | reused for future dashboard charts |
| `--sidebar`, `--sidebar-foreground`, `--sidebar-primary(-foreground)`, `--sidebar-accent(-foreground)` | mirrors `--card`/`--primary`/`--secondary` mapping | |
| `--radius` | `0.625rem` (literal) | matches existing `.btn { border-radius: 10px }` |

Any new shadcn component that introduces a token not in this table MUST have that token added
here (aliased to an existing `--color-*`/app variable) before the component is considered
migrated — never left pointing at a shadcn default oklch value.

## Theme Variant

Existing entity (not introduced by this feature), referenced for verification scope only:

| `data-theme` value | Source |
|---|---|
| `dark` (default) | `stores/ui.js` `applyThemeAttrs()` when `darkMode && !highContrast` |
| `light` | when `!darkMode && !highContrast` |
| `high-contrast` | when `highContrast === true` |

Plus the independent `data-colorblind="true"` attribute, which only remaps hazard-severity
colors and is orthogonal to the three `data-theme` values above.
