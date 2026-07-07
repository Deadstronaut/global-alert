# Data Model: Sığınakların Harita Üzerinde Gösterimi

Bu spec yeni bir veritabanı tablosu/kolonu eklemez. Aşağıda, mevcut `shelters` verisinin bu özellik için nasıl tüketildiği ve yeni frontend-only state/fonksiyonlar özetlenmiştir.

## Mevcut Entity (değişmedi): Shelter

Kaynak: `supabase/migrations/20260707230000_shelters.sql` (spec 021), `src/stores/shelters.js`.

| Alan | Tip | Bu spec'teki kullanımı |
|---|---|---|
| `id` | UUID | Marker/popup key'i |
| `name` | TEXT | Popup başlığı |
| `lat`, `lng` | DOUBLE PRECISION (nullable) | Marker konumu — `NULL` ise marker oluşturulmaz (FR-002) |
| `capacity_total`, `capacity_occupied` | INTEGER | `occupancyPercentage()` (mevcut store helper) ile "X/Y (%Z)" popup metni |
| `status` | TEXT (`open`\|`full`\|`closed`) | Marker renk kodlaması (FR-004) |
| `is_active` | BOOLEAN | `false` ise marker oluşturulmaz (FR-002) |
| `linked_incident_id` | UUID (nullable) | Doluysa popup'ta "İlgili bir olaya bağlı" göstergesi (FR-007, research.md Decision 4) |

## Yeni Frontend State (bu spec ile eklenir)

### `uiStore` (`src/stores/ui.js`)

- `showShelters: Ref<boolean>` — varsayılan `true`. Sığınak katmanının haritada görünür olup olmadığını kontrol eder.
- `toggleShelters(): void` — `showShelters.value = !showShelters.value`.

### `src/services/shelterMarkerStyle.js` (yeni dosya, saf fonksiyonlar)

- `getShelterMarkerColor(status: 'open' | 'full' | 'closed' | string): string`
  - `'open'` → yeşil hex (örn. `#22c55e`)
  - `'full'` → turuncu hex (örn. `#f97316`)
  - `'closed'` → gri hex (örn. `#94a3b8`)
  - Bilinmeyen/eksik `status` → gri hex (fallback, hataya düşmez)
- (Opsiyonel, implementasyon sırasında kararlaştırılabilir) `getShelterMarkerIcon(): string` — sabit bir ikon/glif döndürür (tüm sığınaklar için aynı, "tip" alanı yok).

## MapView.vue içi modül-seviyesi state (yeni)

- `shelterMarkerObjects: maplibregl.Marker[]` — mevcut `markerObjects`'e paralel, ayrı bir dizi. `clearShelterMarkers()` ile temizlenir.

## Fonksiyon sözleşmeleri (implementasyon detayı, tasks.md'de netleşecek)

- `updateShelterMarkers()`: `sheltersStore.shelters` üzerinde filtreler (`is_active && lat != null && lng != null`), her biri için `maplibregl.Marker` oluşturur, `getShelterMarkerColor(shelter.status)` ile stil verir, popup içeriğini oluşturur (ad, doluluk, durum, bağlı-olay göstergesi), `shelterMarkerObjects`'e push eder. `showShelters === false` ise hiç çalıştırılmaz / mevcut marker'lar temizlenir.
- `clearShelterMarkers()`: `shelterMarkerObjects` içindeki her marker'da `.remove()` çağırır, diziyi boşaltır.
