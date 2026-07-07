# Quickstart: Impact Analysis Gaps

## Prerequisites

- Migration `<timestamp>_impact_analysis_gaps.sql` uygulanmış (`npx supabase db push --linked`).
- En az bir `exposure_dataset` + birkaç `exposure_features` (bazıları `asset_category`/`sector`/`admin_boundary_code` etiketli, bazıları etiketsiz).
- En az bir `impact_scenario` (mevcut dataset'e bağlı, `country_code` dolu).
- Test edilecek bir `cap_drafts` kaydı (aynı `country_code`).

## Senaryo 1 — Kritik altyapı öne çıkarma (US1)

1. Bir exposure dataset'ine `asset_category='critical_infrastructure_health'` etiketli bir hastane varlığı ve `asset_category=NULL` etiketli birkaç konut varlığı ekleyin.
2. ImpactPanel.vue'da bu dataset seçilip analiz çalıştırılır.
3. **Beklenen**: Sonuç ekranında "Kritik Altyapı" adlı ayrı bir liste, sadece hastane varlığını gösterir; konut varlıkları bu listede görünmez ama genel toplamda sayılmaya devam eder.
4. Dataset'te hiç `critical_infrastructure_*` etiketli varlık yoksa: "kritik altyapı verisi yok" mesajı gösterilir, hata oluşmaz.

## Senaryo 2 — CAP onayında (yayınında) impact snapshot arşivleme (US2)

1. Test `country_code`'u için en az bir `impact_scenario` mevcut olsun.
2. Aynı `country_code`'a sahip bir `cap_drafts` kaydının `status`'unu `'broadcast'`'a güncelleyin (mevcut yayın akışı üzerinden).
3. **Beklenen**: `impact_snapshots` tablosunda bu `cap_draft_id`'ye bağlı yeni bir satır oluşur; `data_available=true`, `snapshot_data` o anki `impact_scenarios.result_snapshot` ile eşleşir.
4. Ardından ilgili `impact_scenarios` satırını güncelleyin (`result_snapshot`'ı değiştirin).
5. **Beklenen**: `impact_snapshots`'taki satır DEĞİŞMEZ (orijinal onay anındaki veriyi korur).
6. Hiç `impact_scenario`'su olmayan bir `country_code` için bir CAP taslağını yayına alın.
7. **Beklenen**: Yine bir `impact_snapshots` satırı oluşur ama `data_available=false`, `snapshot_data=NULL`, onay süreci hatasız tamamlanır.

## Senaryo 3 — Sektörel / idari sınır agregasyonu (US3)

1. Bir dataset'e `sector='health'`, `sector='education'`, `sector=NULL` etiketli varlıklar ekleyin.
2. ImpactPanel.vue'da "Sektöre Göre Kırılım" görünümünü açın.
3. **Beklenen**: `health`, `education` ve `unclassified` için ayrı alt toplamlar gösterilir; alt toplamların toplamı genel toplamla eşleşir.
4. Aynı testi `admin_boundary_code` ile idari sınır kırılımı görünümü için tekrarlayın.

## Senaryo 4 — Veri tamlığı skoru (US4)

1. Bir dataset'teki varlıkların %80'ine `sector` veya `asset_category` etiketi verin, %20'sini etiketsiz bırakın.
2. Analiz çalıştırın.
3. **Beklenen**: Sonuçla birlikte ~%80 veri tamlığı skoru gösterilir.
4. Tüm varlıkları etiketleyin, tekrar çalıştırın: skor %100 olmalı.
5. Yarıçap içinde hiç varlık olmayan bir noktada analiz çalıştırın: skor "veri yok" olarak gösterilmeli (NULL/0 karışıklığı olmamalı).
