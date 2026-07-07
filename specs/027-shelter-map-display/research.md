# Research: Sığınakların Harita Üzerinde Gösterimi

## Decision 1: Marker rendering yaklaşımı — mevcut `updateMarkers()` deseni mi, yoksa `map_layers` (WMS/WFS) registry mi?

**Decision**: Mevcut disaster-event marker deseni (`updateMarkers()`/`clearMarkers()`, `maplibregl.Marker` + custom DOM elemanı) birebir mirror edilir, ayrı bir fonksiyon seti (`updateShelterMarkers()`/`clearShelterMarkers()`) olarak.

**Rationale**: `map_layers` registry'si (spec 012) sadece harici WMS/WFS OGC endpoint'lerini raster/vektör katman olarak render etmek için tasarlandı — kaynak `source_type CHECK IN ('wms','wfs')` ile kısıtlı. Sığınaklar ise doğrudan Supabase tablosundan gelen basit lat/lng noktaları; bu registry'ye "uydurmak" (örn. sahte bir WFS endpoint'i simüle etmek) gereksiz bir dolaylama olur ve mimari olarak yanlış katmana veri sızdırır. Disaster-event marker deseni zaten aynı ihtiyacı (Supabase tablosundan nokta verisi → renkli/ikonlu marker + popup) çözüyor.

**Alternatives considered**:
- `map_layers` registry'ye yeni bir `source_type='internal-points'` eklemek — reddedildi: registry'nin WMS/WFS'e özel semantiğini (URL, opaklık, harici endpoint) bozar, YAGNI.
- GeoJSON source + MapLibre `circle`/`symbol` layer (WFS render yolunda kullanılan yöntem) — reddedildi: disaster-event'ler zaten `maplibregl.Marker` (DOM tabanlı) kullanıyor, popup/interaktivite/custom-HTML ihtiyacı için DOM-marker yaklaşımı bu projede zaten kanıtlanmış desen; tutarlılık için aynı yöntem tercih edildi.

## Decision 2: Toggle state — `mapMode` gibi radio mı, yoksa bağımsız boolean mı?

**Decision**: `uiStore`'a bağımsız bir `showShelters` boolean (ref, varsayılan `true`) eklenir — `mapMode` (`normal`/`hexagon`/`heatmap`, birbirini dışlayan 3 mod) ile karıştırılmaz.

**Rationale**: Sığınak katmanı, harita görselleştirme modundan (normal/hexbin/heatmap) bağımsız olarak her zaman anlamlı bir bilgi katmanıdır — heatmap modundayken de sığınak konumları görülebilmelidir. Bu yüzden `mapMode`'un bir üyesi değil, `sidebarOpen` gibi bağımsız bir boolean + `toggleShelters()` action'ı doğru desendir.

**Alternatives considered**: `mapMode`'a 4. bir değer eklemek — reddedildi, semantik olarak yanlış (mutually exclusive olmayan bir kavramı mutually exclusive bir state'e zorlamak).

## Decision 3: Saf fonksiyonun konumu — `MapView.vue` içinde mi, ayrı dosyada mı?

**Decision**: `getShelterMarkerColor(status)` (ve varsa `getShelterMarkerIcon()`) `src/services/shelterMarkerStyle.js` adlı yeni, bağımsız bir modülde tanımlanır; hem `MapView.vue` hem `tests/unit/shelterMarkerStyle.test.js` bunu import eder.

**Rationale**: Proje convention'ı (`src/stores/hazardTypes.js`'deki `getChildren`/`wouldCreateCycle`, `src/stores/integrationSettings.js`'deki `formatIntegrationStatus`/`mergeTemplateAndCustomFields`) saf, mock'suz test edilebilir mantığı ayrı bir dosyada tutup doğrudan import etmek. `src/services/adapters/DisasterEvent.js`'deki `getSeverityHex`/`getDisasterIcon` de aynı deseni (ayrı `services/` dosyası) izliyor — bu yeni dosya o dizin altında, aynı desende yer alır.

**Alternatives considered**: Fonksiyonu doğrudan `MapView.vue`'nun `<script setup>` içine yazmak — reddedildi, Vitest'in `<script setup>` içindeki fonksiyonları izole test etmesi zordur (component mount gerektirir), proje convention'ına aykırı.

## Decision 4: Bağlı incident (linked_incident_id) bilgisi popup'ta nasıl gösterilir?

**Decision**: Popup, `linked_incident_id` doluysa sadece "İlgili bir olaya bağlı" gibi genel bir ifade gösterir — incident başlığını çözmek için ekstra bir sorgu/store bağımlılığı EKLENMEZ.

**Rationale**: Spec FR-007 sadece "bağlantı belirtilmelidir" diyor, incident başlığının tam metnini şart koşmuyor. `incidentsStore`'un harita açılışında zaten yüklü olacağı garanti değil (country-scoped RLS'e tabi, farklı bir sayfa akışı) — bunu popup'a bağlamak yeni bir fetch veya store-cross-dependency gerektirir, bu spec'in "frontend-only, minimal" kapsamına aykırı bir karmaşıklık ekler. Basit "bağlı" göstergesi FR-007'yi karşılar ve YAGNI'ye uygundur.

**Alternatives considered**: `incidentsStore.incidents` içinde `linked_incident_id`'yi arayıp başlığı göstermek — reddedildi (şimdilik), çünkü incident store'un o an yüklü/güncel olduğu garanti edilemez ve cross-store bağımlılığı gereksiz karmaşıklık katar; gelecekte istenirse ayrı bir küçük iyileştirme olarak eklenebilir.

## Decision 5: Zoom'a bağlı gizleme kuralı sığınaklara uygulanır mı?

**Decision**: Hayır — sığınak marker'ları `currentZoom < 8 && (showHeatmap || showHexbins)` kuralına (disaster event'lerin tabi olduğu, `updateMarkers()` satır ~1214) tabi DEĞİLDİR; her zoom seviyesinde, `showShelters` açık olduğu sürece görünür kalır.

**Rationale**: Bu kural disaster event'lerin agregat yoğunluk gösterimiyle (hexbin/heatmap) çakışmasını önlemek için var — düşük zoom'da tekil event marker'ları hexbin/heatmap'in üzerine binmesin diye gizleniyor. Sığınaklar agregat bir yoğunluk göstergesi değil, her zaman ilgili nokta bilgisi (can güvenliği açısından kritik) — spec'in FR-005'i bunu açıkça istiyor.

**Alternatives considered**: Aynı kuralı sığınaklara da uygulamak — reddedildi, spec'in açık gereksinimine (FR-005) aykırı olurdu.
