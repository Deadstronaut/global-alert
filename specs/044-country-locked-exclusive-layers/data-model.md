# Data Model: Country-Locked Map View with Mutually Exclusive Hexagon Layers

## Schema changes

### Migration: `default_zoom` column on `country_boundaries`

```sql
ALTER TABLE country_boundaries ADD COLUMN IF NOT EXISTS default_zoom numeric NULL;

COMMENT ON COLUMN country_boundaries.default_zoom IS
  'Default map zoom level for a country-locked user opening the map on this country (spec 044). '
  'NULL means no configured default — the frontend falls back to fit-to-bounds camera framing.';
```

No RLS policy change needed — `country_boundaries` already has `country_admin` (own row) /
`super_admin` (any row) write policies (`supabase/migrations/20260705_country_boundaries.sql`)
that cover this new column automatically, since RLS is row-scoped, not column-scoped.

## Reused (unmodified) state

```
authStore.session.countryCode   // existing — profiles.country_code
authStore.session.role          // existing — 'viewer' | 'country_admin' | 'org_admin' | 'super_admin'
uiStore.mapMode                 // existing — 'normal' | 'hexagon' | 'heatmap'
layerVisibility                 // existing — MapView.vue ref({}), keyed 'exposure-dataset-<id>'
```

## New derived state

```js
// src/stores/auth.js — one new computed, no new reactive field
const isCountryLocked = computed(() =>
  session.value?.countryCode != null && session.value?.role !== 'super_admin'
)
```

```js
// MapView.vue — reads authStore.isCountryLocked + authStore.countryCode on mount
```

## Behavioral contract (not a new data shape — coordination logic only)

```
selectCountry(f) called (existing)
  → uiStore.mapMode = 'hexagon'                                    (existing)
  → NEW: for every key in layerVisibility starting with 'exposure-dataset-'
         that is currently true, set it to false                   (FR-009)

toggleExposureLayer(dataset) called, turning a dataset ON (existing)
  → NEW: if uiStore.mapMode === 'hexagon':
         uiStore.mapMode = 'normal'
         clear the 'country-hex-grid' source data                  (FR-008)
         (does NOT call full clearCountrySelection() — country
         context/badge/bounds are preserved; only the hex grid
         layer itself is hidden, matching spec.md's framing that
         this is a layer-visibility coordination, not a country
         re-deselection)
  → layerVisibility[key] = true                                    (existing)

Map mount (NEW)
  if authStore.isCountryLocked:
    country = fetch country_boundaries row for authStore.countryCode
    if country.default_zoom is not null:
      map.flyTo({ center: country.centroid, zoom: country.default_zoom })
    else:
      zoomToCountry(country)   // existing fit-to-bounds fallback (FR-003)
    // do NOT register the cross-country dblclick-to-navigate handler (FR-004)
  else:
    // existing anon/global mount behavior, unchanged (FR-006)
```

## Key relationships

```
profiles.country_code  ──►  authStore.session.countryCode  ──►  authStore.isCountryLocked (NEW)
                                                                         │
country_boundaries.default_zoom (NEW column) ───────────────────────────┤
                                                                         ▼
                                                          MapView.vue mount-time camera fit
                                                          + conditional dblclick registration

uiStore.mapMode ('hexagon')  ◄──coordination (NEW)──►  layerVisibility['exposure-dataset-*']
   (hazard hex grid visibility)                          (exposure-layer panel visibility)
```
