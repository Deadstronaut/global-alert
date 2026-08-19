# Implementation Plan: Çapraz-Afet Risk Çıkarımı ve Öngörü Raporu

**Branch**: `071-lateral-risk-inference` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/071-lateral-risk-inference/spec.md`

## Summary

Seçili bir afetin konumundaki mevcut veri katmanlarını (kuraklık/sıcak-soğuk hava dalgası/toz fırtınası hazard'ları, kritik altyapı yakınlığı, yol ağı yoğunluğu, kıyı mesafesi) kural-tabanlı olarak tarayıp "potansiyel ikincil risk" bulguları üreten, tamamen istemci-taraflı bir çıkarım katmanı. Kritik önem eşiğini aşan bir afet olduğunda ana panelde bir tetikleyici gösterilir; tetikleyici, o afet için tek sayfalık, "sezgisel öngörü — doğrulanmamıştır" etiketli bir rapor açar (etkilenen şehir/kasaba, etkilenen kritik tesis, ikincil risk listesi, önerilen kurum türleri). Hiçbir otomatik bildirim/mesaj gönderilmez. Spec 070'in "afet + rüzgar yönü = yayılım" desenini genelleştirir: burada "afet + ortam katmanları = ikincil risk" oluyor, ve spec 070'in kendi yayılım bulgusu bu listeye bir satır olarak dahil edilir.

## Technical Context

**Language/Version**: JavaScript (ES2022+), Vue 3 `<script setup>` — mevcut frontend ile aynı.

**Primary Dependencies**: `h3-js` (zaten var, gridDisk/cellToLatLng tabanlı proximity — spec 070 ile aynı desen), `@unovis/vue` (zaten var, dashboard'un forecast grafiklerinde kullanılıyor — rapor grafikleri için yeniden kullanılacak), mevcut Supabase RPC'leri (`compute_zonal_stats`, `get_critical_infrastructure_features` — `ImpactPanel.vue` zaten kullanıyor), mevcut `src/utils/pointInPolygon.js`/`src/data/boundaries/index.js` (şehir/kasaba — `level: 'district'` — bulma için).

**Storage**: Yeni bir DB tablosu YOK. Rapor ve ikincil-risk bulguları her zaman seçili afet için anlık (on-demand) hesaplanır, hiçbir yerde kalıcı olarak saklanmaz — spec 070'in `SpreadProjection`'ıyla aynı "bellekte hesapla, DB'ye yazma" yaklaşımı. Kıyı-mesafe verisi de yeni bir ingest pipeline'ı GEREKTİRMİYOR — bkz. research.md R2: mevcut ülke sınırı poligonları (zaten haritada yüklü) kullanılarak istemci tarafında hesaplanıyor.

**Testing**: Vitest — kural-değerlendirme ve kıyı-mesafe fonksiyonları saf/bağımsız fonksiyonlar olarak yazılıp birim test edilecek (Anayasa'nın "proximity/nearby-threat distance calculations" test zorunluluğu kapsamına giriyor, spec 070'teki `windSpreadPrediction.js` testleriyle aynı desen).

**Target Platform**: Mevcut Vue 3 SPA (web), aynı build/deploy hattı.

**Project Type**: Web application (mevcut `src/` frontend kökü) — yeni bir backend servisi/worker YOK.

**Performance Goals**: Seçili bir afet için ikincil-risk bulguları 5 saniye içinde görüntülenir (SC-001); bu çoğunlukla zaten var olan RPC gecikmesine bağlı, yeni bir ağır hesaplama eklenmiyor.

**Constraints**: Sistem hiçbir koşulda dış bir sisteme (e-posta/mesaj/webhook) otomatik istek göndermemeli (FR-009) — bu, plan boyunca "mimari bir kısıt" olarak ele alınacak: rapor bileşeni hiçbir dış API/servis çağrısı içermeyecek, sadece mevcut okuma-amaçlı RPC'leri çağıracak.

**Scale/Scope**: MVP kapsamı, arka planda tüm olay veritabanını tarayan bir sürekli iş DEĞİL — sadece (a) kullanıcının seçtiği tek bir afet için anlık hesaplama, ve (b) zaten istemciye çekilmiş olan (son 24s, tip başına limitli) olay listesindeki `severity === 'critical'` olayları taraf bir istemci-taraflı kontrol. Yeni bir sunucu-taraflı arka plan işi/polling servisi kapsam dışı.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. İkincil-risk kural tablosu (`lateralRiskRules.js`, spec 070'in `WIND_AFFECTED_HAZARD_TYPES` desenindeki gibi) veri olarak yaşayacak; yeni bir afet tipi veya yeni bir kural eklemek bu tabloya bir satır eklemekle olacak, `DisasterEvent`/Pinia store/render katmanlarında yapısal değişiklik gerektirmeyecek.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS, ekstra dikkatle. FR-009 zaten "hiçbir otomatik mesaj/bildirim gönderilmez" diyor — bu, Anayasa'nın "Email/Web Portal/WhatsApp only, otomasyon yok" kısıtından da katı. Rapor sadece ekranda gösterilen, dış hiçbir sisteme entegre olmayan salt-okunur bir görünüm olacak.
- **III. CAP v1.2 Compliance** — N/A, bu özellik CAP authoring/export'a dokunmuyor.
- **IV. Data Quality & Normalization** — PASS. Hiçbir yeni ham veri kaynağı eklenmiyor (kıyı-mesafe hariç — o da yeni bir "ingestion" değil, mevcut zaten-normalize edilmiş sınır poligonlarından türetilen bir hesaplama). Her bulgu FR-014 gereği kaynağını (hangi katman/kural) belirtmeli — bu, Anayasa'nın "veri tazeliği/izlenebilirlik" ruhuyla uyumlu.
- **V. Access Control & Auditability** — PASS, mevcut desen yeniden kullanılacak: rapor, `ImpactPanel.vue`'nun zaten sahip olduğu `canAnalyze` (super_admin/country_admin/org_admin) rolü gate'inin AYNISIYLA gösterilecek — daha geniş bir erişim açılmayacak (Assumptions'ta belgelenecek).
- **VI. Accessibility & Internationalization** — DİKKAT gerektiren bir madde: "yanıp sönen tetikleyici" (FR-006), reduced-motion "safe mode" kullanıcıları için sorunlu olabilir. Plan bunu Phase 1'de çözecek: reduced-motion açıkken tetikleyici yanıp sönme yerine sabit bir renk/rozet + sayı olarak gösterilecek (animasyon olmadan da fark edilir kalacak). Tüm yeni metin 7 locale'e eklenecek.
- **VII. Performance & Resilience by Design** — PASS. Yeni bir polling interval'ı YOK; kritik-durum kontrolü zaten var olan disasterStore verisi üzerinde reaktif bir `computed` olarak çalışacak, ayrı bir ağ isteği tetiklemeyecek.
- **VIII. Simplicity & YAGNI** — PASS, ve bu planın en önemli kazanımı: spec'in FR-013'ünde "yeni bir kıyı/batimetri veri katmanı eklenecek" varsayımı, research.md R2'de "mevcut ülke sınırı poligonlarından türetilen bir hesaplama" olarak basitleştirildi — YENİ bir dış veri kaynağı, ingest script'i veya DB tablosu YOK. Yol ağı ve kritik altyapı için de yeni bir RPC yazılmıyor, mevcut `compute_zonal_stats`/`get_critical_infrastructure_features` yeniden kullanılıyor.

Constitution Check sonucu: **PASS, Complexity Tracking'e girecek bir sapma yok.**

## Project Structure

### Documentation (this feature)

```text
specs/071-lateral-risk-inference/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── utils/
│   ├── lateralRiskRules.js        # NEW — kural tablosu (hazard+katman → risk) + coastalDistanceKm() + evaluateLateralRisks()
│   └── institutionCategoryMap.js  # NEW — hazard/risk türü → önerilen kurum kategorileri (statik, tek yer)
├── components/
│   ├── MapView.vue                # MODIFIED — kritik-durum tetikleyici rozeti (header/üst panel), rapor açma butonu
│   └── risk/
│       └── LateralRiskReport.vue  # NEW — tek sayfalık öngörü raporu (modal/panel), grafiklerle
├── stores/
│   └── ui.js                      # MODIFIED — kritik-durum tetikleyici state'i, rapor açık/kapalı state'i
└── i18n/locales/*.json            # MODIFIED — 7 locale, yeni anahtarlar

tests/unit/
├── lateralRiskRules.test.js       # NEW
└── institutionCategoryMap.test.js # NEW (varsa saf mantık)
```

**Structure Decision**: Tek bir web uygulaması (`src/` frontend kökü), spec 070 ile aynı yapı — yeni bir backend servisi/worker eklenmiyor. Çekirdek mantık iki yeni saf/test edilebilir util dosyasında yaşıyor; UI, mevcut `MapView.vue`/`ImpactPanel.vue` altyapısına (RPC'ler, boundary loader, h3 proximity) bağlanan yeni bir `LateralRiskReport.vue` bileşeni.

## Complexity Tracking

*Constitution Check'te gerekçelendirilmesi gereken bir ihlal yok — bu tablo boş.*
