# Boundary data

- `tr-provinces.json` — Turkey's 81 provinces (il), ADM1-level administrative
  boundaries from [geoBoundaries](https://www.geoboundaries.org) via
  [HDX (Humanitarian Data Exchange)](https://data.humdata.org/dataset/geoboundaries-admin-boundaries-for-turkey),
  simplified GeoJSON release. Open license (CC BY 4.0). Each feature's
  `properties.shapeName` is the province name, `properties.shapeISO` is its
  ISO 3166-2 code (e.g. `TR-34` for İstanbul).

Add more countries here as they're onboarded — one GeoJSON FeatureCollection
per country, filename `<country_code>-provinces.json`, same ADM1 source
(HDX/geoBoundaries publishes this for every country).
