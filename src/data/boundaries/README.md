# Boundary data

- `tr-provinces.json` — Turkey's 81 provinces (il), ADM1-level administrative
  boundaries from [geoBoundaries](https://www.geoboundaries.org) via
  [HDX (Humanitarian Data Exchange)](https://data.humdata.org/dataset/geoboundaries-admin-boundaries-for-turkey),
  simplified GeoJSON release. Open license (CC BY 4.0). Each feature's
  `properties.shapeName` is the province name, `properties.shapeISO` is its
  ISO 3166-2 code (e.g. `TR-34` for İstanbul).
- `my-provinces.json` — Malaysia's 13 states + 3 federal territories (16
  features), ADM1-level administrative boundaries from
  [geoBoundaries](https://www.geoboundaries.org) (source: OpenStreetMap),
  simplified GeoJSON release. Open Data Commons ODbL 1.0. Same
  `properties.shapeName` / `properties.shapeISO` convention (e.g. `MY-14`
  for Kuala Lumpur).

Add more countries here as they're onboarded — one GeoJSON FeatureCollection
per country, filename `<country_code>-provinces.json`, same ADM1 source
(HDX/geoBoundaries publishes this for every country).

## District-level (ADM2)

- `tr-districts.json` — Turkey's 973 districts (ilçe), ADM2-level, from
  [geoBoundaries](https://www.geoboundaries.org) (`TUR-ADM2-54988432`,
  source: OpenStreetMap/osm-boundaries.com), simplified GeoJSON release.
  Open Data Commons ODbL 1.0.
- `mg-districts.json` — Madagascar's 119 districts, ADM2-level, from
  [geoBoundaries](https://www.geoboundaries.org) (`MDG-ADM2-10022922`,
  source: Madagascar BNGRC / OCHA ROSA via HDX), simplified GeoJSON release.
  CC BY 3.0 IGO — attribute BNGRC/OCHA ROSA if this data is displayed with
  source attribution elsewhere.
- `my-districts.json` — Malaysia's 159 districts, ADM2-level, from
  [geoBoundaries](https://www.geoboundaries.org) (`MYS-ADM2-92858781`,
  source: citypopulation.de), simplified GeoJSON release. CC BY 3.0 —
  attribute citypopulation.de if this data is displayed with source
  attribution elsewhere.

Same `properties.shapeName` convention as the province files above (no
`shapeISO` at this level — geoBoundaries leaves it blank for ADM2). Add more
countries' district files here the same way, filename
`<country_code>-districts.json`.
