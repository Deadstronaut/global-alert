# Quickstart: Verifying a Shadcn UI Migration Step

Use this after migrating any single component to confirm it meets the spec's "migrated"
definition (SC-001, SC-002) before moving to the next component.

## Prerequisites

- Node deps installed (`npm install`) — Tailwind v4, shadcn-vue, Reka UI, lucide-vue-next
  already in `package.json`.
- Dev server running: `npm run dev`

## 1. Build check (SC-002)

```sh
npx vite build
```

Expected: build completes with no new errors/warnings compared to the pre-migration build. Pay
attention to unused-import or missing-alias warnings from the changed file specifically.

## 2. Visual parity check across themes (SC-001, FR-004)

With the dev server running, open the screen containing the migrated component and toggle
through all three themes via the app's own Settings panel (Dark / Light / High Contrast — this
sets `data-theme` on `<html>`, driving both the legacy CSS and the shadcn token aliases from the
same variables):

- [ ] Dark (default) — component renders with correct background/text/border/accent colors
- [ ] Light — component switches correctly, no leftover dark-only hardcoded colors
- [ ] High Contrast — component remains legible, uses the high-contrast palette (not a
      washed-out dark/light in-between)

## 3. RTL check (SC-001, FR-005)

Switch the app locale to Arabic (`ar`) via the locale switcher. Confirm:

- [ ] Icon/label order mirrors correctly inside the migrated component
- [ ] Any directional icon (chevron, arrow) flips as expected
- [ ] Alignment/padding reads correctly right-to-left, matching surrounding legacy RTL layout

## 4. Consistency check (SC-005)

- [ ] Migrated component's spacing/radius/color rhythm matches other already-migrated
      components and doesn't clash with adjacent still-legacy components on the same screen

## 5. Behavior regression check (FR-003, SC-004)

- [ ] Every click handler / keyboard interaction the component had before migration still works
      identically (e.g. a toggle button still calls the same Pinia store action)
- [ ] No Pinia store shape or event contract changed as a side effect of the migration

## Marking complete

Once all boxes above are checked for a component, update its status to `migrated`/`verified` in
the migration tracking list (see `data-model.md` → UI Component Migration Record, and
`tasks.md`).
