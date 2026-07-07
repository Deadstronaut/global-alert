# Research: Impact Analysis Gaps

## Decision 1: Onay-anı arşivleme hangi durum geçişine bağlanacak?

**Decision**: `impact_snapshots` arşivleme, `cap_drafts.status` `'broadcast'`'a geçtiği anda tetiklenir — spec 009'un mevcut `notify_dispatch_on_broadcast()` trigger'ının bağlı olduğu AYNI durum geçişi (`supabase/migrations/20260707120200_cap_broadcast_dispatch_trigger.sql:52-57`), fakat **ayrı bir trigger fonksiyonu** olarak.

**Rationale**: Projede ayrı bir "approved" durumu yok; CAP taslağının fiilen halka ulaştığı/yayınlandığı an `status='broadcast'`'tır — spec'in "onay anı" ifadesiyle kastedilen operasyonel an budur. Ayrı bir trigger kullanmak (dispatch trigger'ına kod eklemek yerine), iki kaygıyı (dispatch tetikleme vs. impact arşivleme) birbirinden ayırır; biri başarısız olursa diğerini etkilemez.

**Alternatives considered**: `notify_dispatch_on_broadcast()` fonksiyonunun içine ek mantık eklemek — reddedildi, tek fonksiyona iki sorumluluk yüklemek (pg_net çağrısı + DB içi arşivleme) hata ayıklamayı zorlaştırır ve dispatch'in Edge Function'a bağımlılığıyla arşivlemenin senkron DB-içi işlemini karıştırır.

## Decision 2: Impact snapshot, hangi impact_scenario ile eşleştirilecek?

**Decision**: `impact_scenarios`/`exposure_datasets` ile `cap_drafts` arasında doğrudan bir foreign-key ilişkisi yok (impact_scenarios `country_code`/`org_id` taşıyor, cap_drafts ise `region_code` — dispatch hedeflemesi için farklı bir amaçla eklenmiş serbest metin alanı). Bu spec, snapshot'ı CAP taslağının `country_code`'una (varsa `org_id`'sine de) göre en güncel (`created_at DESC LIMIT 1`) `impact_scenarios` kaydıyla eşleştirir.

**Rationale**: Mevcut şemada daha kesin bir eşleştirme (ör. CAP taslağının poligonu ile impact senaryosunun poligonu arasında geometrik kesişim) yok — impact_scenarios zaten sadece ülke/organizasyon seviyesinde scope'lanıyor. En güncel senaryoyu almak, "o CAP yayınlandığında elimizdeki en iyi tahmin neydi" sorusuna makul bir yaklaşık cevap verir; tam hassasiyet bu spec'in kapsamı dışındadır (FR-005/FR-011'in "veri yok" durumu, hiç eşleşen senaryo olmadığında zaten devreye girer).

**Alternatives considered**: CAP taslağına yeni bir `impact_scenario_id` FK alanı ekleyip yönetici tarafından elle seçilmesini istemek — reddedildi, mevcut CAP oluşturma UI akışına yeni bir zorunlu adım ekler (kapsam dışında bırakılan bir UX değişikliği); otomatik en-güncel-eşleştirme YAGNI'ye daha uygun.

## Decision 3: Veri tamlığı skoru neyi ölçecek?

**Decision**: `exposure_features.metric_value` sütunu şemada zaten `NOT NULL` (spec 008) — yani "eksik metrik" senaryosu bu haliyle var olamaz. Bu nedenle veri tamlığı skoru, bu spec'te YENİ eklenen etiketleme alanlarının (kritik altyapı kategorisi, sektör, idari sınır kodu) ne kadarının doldurulduğunu ölçer: `dataset içindeki toplam varlık / (asset_category IS NOT NULL OR sector IS NOT NULL) olan varlık sayısı`.

**Rationale**: Spec'in asıl amacı "bu impact sonucuna ne kadar güvenebilirim" sorusuna cevap vermek; mevcut şemada tek zorunlu metrik zaten hep dolu olduğundan, gerçek belirsizlik kaynağı sektörel/kritik-altyapı kırılımının ne kadar eksiksiz olduğudur (etiketlenmemiş varlıklar "unclassified" grubuna düşer — US3/FR-009). Veri tamlığı skoru bu iki story'i doğal olarak birbirine bağlar.

**Alternatives considered**: `properties` JSONB alanının genel doluluğunu ölçmek — reddedildi, çok genel/anlamsız bir metrik olurdu (hangi property'nin önemli olduğu belirsiz); yeni eklenen, karar-kritik alanlara odaklanmak daha açıklanabilir.

## Decision 4: Kritik altyapı / sektör / idari sınır bilgisi nasıl saklanacak?

**Decision**: `exposure_features`'a üç yeni nullable kolon: `asset_category TEXT` (ör. `'critical_infrastructure_health'`, `'critical_infrastructure_education'`, `'critical_infrastructure_emergency'`, `'residential'`, `NULL`→'unclassified'), `sector TEXT` (serbest metin, ör. 'health'/'education'/'housing'), `admin_boundary_code TEXT` (serbest metin, ör. bir ilçe/mahalle kodu).

**Rationale**: Mevcut `properties JSONB` alanı zaten var ama sorgulanabilirlik ve `GROUP BY` performansı için ayrı, indekslenebilir kolonlar tercih edilir (projenin genel additive-kolon convention'ı, ör. spec 019/026/032'deki yeni kolonlar). `asset_category` üzerinden basit bir `LIKE 'critical_infrastructure_%'` veya ayrı bir `is_critical_infrastructure BOOLEAN GENERATED ALWAYS AS` sütunuyla kritik altyapı filtrelemesi yapılabilir.

**Alternatives considered**: Sabit bir enum tipi (`CREATE TYPE asset_category_enum AS ENUM (...)`) — reddedildi; hazard-agnostic/model-driven ilkeye göre yeni bir kategori eklemek (ör. yeni bir kritik altyapı alt tipi) bir enum migration'ı gerektirmemeli, düz `TEXT` + config/sabit liste (frontend'de) yeterli ve daha esnek (spec 010'daki hazard_types tablosu deseniyle tutarlı: config verisi bir DB tablosunda/sabit listede, kod değil).

## Decision 5: Sektörel/sınır agregasyonu — yeni fonksiyon mu, mevcut fonksiyon genişletmesi mi?

**Decision**: `compute_zonal_stats()` DOKUNULMADAN bırakılır (mevcut çağıranlar/imzası bozulmasın diye); iki YENİ fonksiyon eklenir: `compute_sector_breakdown(dataset_id, center_lat, center_lng, radius_km)` ve `compute_data_completeness(dataset_id, center_lat, center_lng, radius_km)`, ikisi de `compute_zonal_stats` ile aynı `ST_DWithin` filtreleme mantığını kullanır ama `GROUP BY COALESCE(sector, 'unclassified')` (veya `admin_boundary_code`) ile alt toplamlar döner.

**Rationale**: Additive olma ilkesi + tek-sorumluluk; mevcut `compute_zonal_stats` çağrıları (ImpactPanel.vue'nun bugünkü akışı) hiç değişmeden çalışmaya devam eder. Sektör ve idari-sınır kırılımı UI'da ayrı, isteğe bağlı bir "detay" görünümü olarak sunulabilir.

**Alternatives considered**: `compute_zonal_stats`'ın dönüş tipini `RETURNS TABLE(...)` olarak genişletip sektör kırılımını JSONB bir sütun olarak eklemek — reddedildi, dönüş imzasını değiştirmek geriye dönük uyumluluğu riske atar ve fonksiyonun tek-amaçlılığını bozar.
