# Research: Sandboxed AI Assistance

## Karar 1 — AI sağlayıcı entegrasyonu: OpenAI-uyumlu HTTP arayüzü, dağıtım-başına yapılandırılabilir

**Karar**: Tek bir vendor SDK'sına bağlanmak yerine, `supabase/functions/shared/aiProvider.ts` adında
paylaşımlı bir Deno modülü yazılır. Bu modül OpenAI Chat Completions / Vision API şeklindeki
(fiili endüstri standardı hâline gelmiş) HTTP sözleşmesini konuşur. Sağlayıcı, model adı ve API
anahtarı ortam değişkenleriyle (`AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`,
`AI_PROVIDER_TEXT_MODEL`, `AI_PROVIDER_VISION_MODEL`) her dağıtımda ayrı ayrı ayarlanır.

**Gerekçe**: Federasyon/self-host hedef mimarisinde ([[project_federation_setup_plan]]) her ülke
kendi Supabase+Docker örneğini barındırır; tek bir bulut sağlayıcıya (ör. yalnızca OpenAI'ye)
sabit kablolama yapmak, SMTP/mailer için zaten benimsenmiş "her dağıtım kendi config'ini sağlar"
ilkesiyle ([[project_smtp_self_hosted_design]]) çelişir. OpenAI-uyumlu HTTP sözleşmesi hem OpenAI
hem Azure OpenAI hem de kendi barındırılan (Ollama, vLLM, LiteLLM gateway) sunuculara karşı
çalışır — bir ülke isterse kendi sunucusunda barındırdığı bir modeli kullanabilir.

**Değerlendirilen alternatifler**:
- Tek bir vendor SDK'sı doğrudan gömülü — reddedildi: self-host/federasyon gereksinimiyle
  uyuşmuyor, tek noktaya kilitliyor.
- Kendi içimizde bir ML modeli eğitmek/barındırmak — reddedildi: spec'te ve önceki kararda
  ("tahminleme dışarıdan alınacak") açıkça kapsam dışı bırakıldı, devasa bir karmaşıklık artışı
  olurdu (Principle VIII).

## Karar 2 — Anomali bayrağı: LLM çağrısı DEĞİL, deterministik istatistiksel eşik

**Karar**: "AI-flagged — unusual pattern" özelliği bir LLM/ML çağrısı yapmaz. Aynı `source_id`
(data_sources kaydı) ve hazard type için yakın geçmişteki değerlerin ortalama/standart sapması
üzerinden basit bir z-skoru (`|value - mean| / stddev > eşik`) hesaplanır; bu hesap ya bir Postgres
fonksiyonunda ya da ingestion sonrası hafif bir Edge Function adımında çalışır.

**Gerekçe**: Spec'in Assumptions bölümü bunu açıkça istiyor ("basit istatistiksel eşik... bayrak
mantığının kendisini denetlenebilir tutmak için"). Ayrıca hazard veri hattı, risk endeksinden
(spec 039) bile daha kritik bir denetlenebilirlik alanı — burada gerçek bir ML modeli, projenin
"tahminleme/risk skorlama asla AI'dan etkilenmez" ilkesinin ruhuna aykırı düşerdi. Performans
açısından da (Principle VII) ingestion hot path'ine senkron bir LLM çağrısı eklemek, en hızlı
kaynak olan depremler için (1 dakika döngü) kabul edilemez gecikme yaratırdı.

**Değerlendirilen alternatifler**:
- Gerçek bir anomali-tespit ML modeli — reddedildi: denetlenebilirlik ve performans riskleri,
  spec'in kendi varsayımına aykırı.
- Anomali kontrolünü tamamen kaldırmak — reddedildi: User Story 4 açık bir gereksinim, sadece
  "AI" kelimesinin ima ettiği şeyin bir LLM olması gerekmiyor; ürün dilinde "AI-flagged" etiketi
  korunur ama uygulama basit istatistiktir (aynı INFORM-index'in "AI değil, deterministik formül"
  felsefesiyle tutarlı).

## Karar 3 — Tetikleme modeli: çeviri/özetleme kullanıcı-tetiklemeli, fotoğraf sınıflandırma gönderim-anı otomatik (ama pasif)

**Karar**: Çeviri ve özetleme, kullanıcının açıkça tıkladığı bir "AI ile öner" aksiyonuyla
tetiklenir — hiçbir kayıt/gönderim akışına otomatik olarak eklenmez. Fotoğraf ön-sınıflandırma ise
`submit-community-report` Edge Function'ı içinde, gönderimi asla bloklamayan bir "fire-and-forget"
adım olarak arka planda tetiklenir; sonucu moderatör kuyruğuna kadar ulaşmasa da gönderim başarıyla
tamamlanır.

**Gerekçe**: FR-004 ve FR-008 — AI çağrısı hiçbir zaman mevcut kaydetme/gönderme akışını
geciktirmemeli veya bloklamamalı. Çeviri/özetleme zaten insan-başlatmalı bir istek olduğu için bu
doğal olarak sağlanıyor. Fotoğraf sınıflandırma tek istisna çünkü değeri moderatörün SIRAYA
BAKTIĞI ana kadar hazır olmasında; senkron yapmak gönderim UX'ini (özellikle sahadaki vatandaşın
zayıf bağlantısını) AI sağlayıcısının gecikmesine bağımlı kılardı — bu nedenle asenkron/arka plan
olarak tasarlandı.

**Değerlendirilen alternatifler**:
- Fotoğraf sınıflandırmayı da moderatörün elle tıklamasına bağlamak — reddedildi: triyaj hızını
  artırma amacını (User Story 3, SC-006) zayıflatır, moderatör zaten kuyruğa baktığında öneri
  hazır olmalı.

## Karar 4 — Veri modeli: iki jenerik tablo (`ai_capability_config`, `ai_suggestions`)

**Karar**: Dört yeteneği tek tip bir şemada tutan iki yeni, jenerik tablo eklenir; `cap_drafts`,
SOP, `incidents`, `community_reports` tablolarına yeni sütun EKLENMEZ.

**Gerekçe**: Principle VIII (Simplicity & YAGNI) ve mevcut proje deseni (community_reports'un
kendi tablosu, shelter'ların kendi tablosu gibi) — dört farklı özelliği dört farklı şema yerine
tek bir jenerik "öneri" tablosunda tutmak hem audit/raporlama yüzeyini tekilleştirir hem de mevcut
tablolara migration riski taşımaz (tamamen additive).

**Değerlendirilen alternatifler**:
- Her kaynak tabloya `ai_suggested_translation`, `ai_suggested_summary` gibi sütunlar eklemek —
  reddedildi: 4 farklı tabloyu (cap_drafts, sop_documents, incidents, community_reports) migration
  ile değiştirmek gerekir, audit/raporlama dağılır, gelecekte yeni bir AI yeteneği eklemek yine
  şema değişikliği gerektirir.

## Karar 5 — Audit: mevcut `log_table_change()` tetikleyicisi yeniden kullanılır

**Karar**: `ai_suggestions` tablosuna da `AFTER INSERT OR UPDATE` olarak mevcut audit trigger'ı
bağlanır; ayrı bir audit kod yolu yazılmaz.

**Gerekçe**: FR-005/SC-002, spec 007'nin hash-zincirli audit_log'u zaten bunu sağlıyor —
`community_reports`, `cap_drafts`, `incidents` ile birebir aynı desen.

## Karar 6 — Yetkilendirme: her Edge Function, kaynak varlık üzerindeki mevcut yetkiyi kontrol eder

**Karar**: Yeni bir rol/izin sistemi icat edilmez. `ai-translate`/`ai-summarize` çağrısı, çağıran
kullanıcının o alert/SOP/incident üzerinde zaten sahip olduğu düzenleme yetkisini (mevcut RLS/rol
kontrolleriyle aynı mantığı Edge Function içinde tekrar eden bir kontrol) doğrular; `ai-classify-photo`
sonucunu görüntüleme/onaylama yalnızca `community_reports` moderasyon yetkisine sahip rollere
(country_admin/super_admin) açıktır.

**Gerekçe**: FR-009, Principle V (Access Control) — mevcut RBAC modelini genişletmek yerine ona
delege etmek en az karmaşıklığı taşıyan yol.
