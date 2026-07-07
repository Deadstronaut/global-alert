# Research: Audit & Compliance Gaps

## Decision 1: Retention policy kapsamı hangi kategorilerle sınırlı?

**Decision**: İlk kapsam sadece iki yüksek-hacimli, zaman-damgalı kategoriyle sınırlı: `audit_log` ve `dispatch_receipts`. Kategori bir serbest-metin `category` alanı olarak saklanır (config verisi, enum değil), yeni bir kategori eklemek sadece yeni bir `retention_policies` satırı gerektirir — kod değişikliği yok.

**Rationale**: Bu iki tablo constitution'ın hazard-agnostic/model-driven ilkesine paralel olarak "en hızlı büyüyen, en az iş-kritik referans veri taşıyan" tablolardır — `cap_drafts`/`contacts`/`hazard_types` gibi referans/iş verisi bu spec'in kapsamına alınmaz (silinmesi/arşivlenmesi başka sistemleri bozabilir). `category` alanının serbest metin olması, gelecekte yeni bir tablo eklemek istendiğinde şema değişikliği gerektirmez.

**Alternatives considered**: Tüm tablolar için genel bir retention mekanizması (tablo adı parametreli, dinamik SQL ile) — reddedildi; dinamik `EXECUTE format(...)` ile rastgele tabloya karşı DELETE/arşivleme çalıştırmak, YAGNI'ye aykırı bir karmaşıklık ve güvenlik riski (SQL injection yüzeyi) getirir. İlk sürüm sadece bilinen iki tablo için özel mantık içerir; genişletme ihtiyacı doğarsa ayrı bir spec'te ele alınır.

## Decision 2: "Arşivle" eylemi ne anlama gelir?

**Decision**: `audit_log` için arşivleme, süresi dolan satırları yeni bir `audit_log_archive` tablosuna (aynı sütun şeması) taşımak ve kaynak tablodan silmektir. `dispatch_receipts` için arşivleme, ilgili `dispatch_jobs`/`cap_drafts` zaten `ON DELETE CASCADE` zincirine bağlı olduğundan, sadece `dispatch_receipts`'in kendisini bir `dispatch_receipts_archive` tablosuna taşır (job/cap_draft'a dokunmaz).

**Rationale**: "Arşivleme" kaydı kalıcı olarak kaybetmez (spec'in "sil" ile net ayrımı, FR-004/Assumptions), ama aktif tablonun performansını/boyutunu kontrol altında tutar. Ayrı bir arşiv tablosu, mevcut RLS/sorgu davranışını (aktif tabloya bakan tüm view/kod) hiç değiştirmeden bırakır.

**Alternatives considered**: Harici obje depolama (S3/Supabase Storage) — reddedildi, "kalan" notlarında zaten "PDF kanıt paketleri/nesne depolama" bilinçli olarak kapsam dışı bırakılmıştı; bu spec de aynı sınırı korur (YAGNI, mevcut Postgres-only mimari).

## Decision 3: Evidence package hangi formatta paketlenir?

**Decision**: Client-side, `jszip` ile üretilen bir `.zip` dosyası: `alert.xml` (mevcut `generateCapXml()`, spec 014, değişmeden), `receipts.csv` (mevcut `rowsToCsv()` + `dispatch_receipts` sorgusu), `audit-log.csv` (mevcut `rowsToCsv()` + ilgili `audit_log` satırları). Bir `manifest.json` (paket içeriğinin özeti — kaç receipt, kaç audit kaydı, oluşturulma zamanı) saf bir `buildEvidencePackageManifest()` fonksiyonuyla üretilir ve test edilir.

**Rationale**: Mevcut export altyapısının (CAP XML, CSV yardımcıları) doğrudan yeniden kullanımı — hiçbir yeni export formatı icat edilmiyor, sadece bir araya getiriliyor. Client-side ZIP oluşturma, yeni bir Edge Function/sunucu depolama gerektirmez (YAGNI).

**Alternatives considered**: Sunucu tarafında bir Edge Function'ın ZIP'i oluşturup Supabase Storage'a yazması — reddedildi; ekstra depolama yönetimi (temizlik, erişim kontrolü) gerektirir, mevcut ihtiyaç (anlık indirme) için gereksiz karmaşıklık.

## Decision 4: Controlled deletion hangi tablolara uygulanır?

**Decision**: İlk kapsam sadece `exposure_datasets` — araştırmayla doğrulandı, bu bugün projede gerçek bir hard-delete (`ExposureDatasetManager.vue:70-73`, doğrudan `supabase.from('exposure_datasets').delete()`) olan TEK tablo. `contacts` için ayrı bir "sil" yolu yok (sadece `deactivateContact()`/`anonymizeContact()`, spec 031) — bu spec `contacts`'a yeni bir hard-delete yolu EKLEMEZ, sadece var olanı (`exposure_datasets`) gerekçelendirir.

**Rationale**: Spec'in orijinal önerisi (`contacts`, `exposure_datasets`) araştırmayla güncellendi — `contacts` zaten anonimleştirme yoluyla "kontrollü silme"nin bir güçlü biçimini spec 031'de almıştı, ayrı bir hard-delete yolu eklemek constitution'ın YAGNI ilkesine aykırı yeni bir silme mekanizması icat etmek olurdu. `delete_with_justification(table_name, record_id, justification)` fonksiyonu, `table_name` parametresiyle genel yazılır ama başlangıçta sadece `exposure_datasets` için bir güvenlik allow-list kontrolüyle sınırlandırılır — gelecekte yeni bir tablo eklemek, bu allow-list'e bir satır eklemek kadar kolaydır.

**Alternatives considered**: `contacts`'a da yeni bir hard-delete butonu eklemek — reddedildi, mevcut anonimleştirme akışı zaten GDPR uyumluluğu için tasarlanmış (spec 031) ve onunla çakışan ikinci bir "sil" yolu kafa karıştırıcı olurdu.

## Decision 5: Security event nasıl işaretlenir?

**Decision**: `audit_log`'a additive bir `event_category TEXT NOT NULL DEFAULT 'data_change'` kolonu (`CHECK IN ('data_change','security_event')`). Mevcut `record_failed_login()` (spec 028) fonksiyonu, hesap kilitlendiği anda (`locked_until` set edildiğinde) `audit_log`'a `event_category='security_event'` ile ek bir satır ekler — `log_table_change()`'in genel `UPDATE` kaydına EK olarak, onun yerine geçmez.

**Rationale**: Tek bir tabloda kategori ayrımı, ayrı bir tablo (`security_events`) açmaktan daha az karmaşık ve mevcut audit görüntüleme/export altyapısını (RLS, CSV export) hiç değiştirmeden yeniden kullanır — sadece bir `WHERE event_category = 'security_event'` filtresi eklenir.

**Alternatives considered**: Ayrı bir `security_events` tablosu — reddedildi; `audit_log` zaten genel amaçlı bir olay kaydı, ikinci bir paralel tablo veri modelini gereksiz yere çoğaltır (YAGNI).

## Decision 6: Security config raporu hangi verileri içerir?

**Decision**: `get_security_config_report()`, `get_access_review()` (spec 028) ile birebir aynı desende (SECURITY DEFINER, STABLE, super_admin-only) şu alanları tek bir JSONB/satırda döner: `mfa_role_policy` tablosundaki rol→zorunluluk eşlemesi, `retention_policies` sayısı ve özet listesi, `profile_capability_grants`'taki aktif yetki sayısı (capability bazında gruplu).

**Rationale**: Araştırma `mfa_required` diye bir `profiles` kolonu olmadığını, bunun yerine ayrı bir `mfa_role_policy` tablosu (spec 005) olduğunu doğruladı — rapor bu gerçek kaynağı kullanır, spekülatif bir kolon icat etmez.

**Alternatives considered**: Yok — bu, mevcut üç kaynağın (mfa_role_policy, retention_policies, profile_capability_grants) doğrudan birleşimi, alternatif tasarım gerektirmiyor.

## Decision 7: Retention silme/arşivleme, audit_log'un "append-only" RLS kısıtıyla nasıl uyumlu?

**Decision**: `audit_log` üzerinde `"no_update_audit"`/`"no_delete_audit"` RLS policy'leri (`USING (false)`, `supabase/migrations/20260605120000_audit_log.sql:26-29`) tabloyu HERKESE (super_admin dahil) karşı UPDATE/DELETE'e kapatıyor. `enforce_retention_policies()` bu satırları silebilmek için, `log_table_change()` ile aynı şekilde tablo sahibi rolün SECURITY DEFINER ayrıcalığıyla çalışır — RLS policy'leri client/PostgREST rolleri için geçerlidir, tablo sahibi (migration'ları çalıştıran rol) RLS'ten muaftır, bu yüzden bir SECURITY DEFINER fonksiyonu (tablo sahibi tarafından tanımlanan) bu kısıtı atlayabilir.

**Rationale**: Bu, `audit_log`'un "immutable" tasarımını ihlal etmiyor — append-only kısıt, keyfi/client-taraflı silmeyi engellemek içindir (denetim izinin biri tarafından gizlice değiştirilememesi). Yasal/düzenleyici olarak izin verilen, YAPILANDIRILMIŞ ve kendisi de loglanan bir retention silme işlemi farklı bir kategori: bu spec'in FR-003'ü, silme işleminin kendisinin bir `audit_log` kaydı ("retention_enforced") bırakmasını zaten zorunlu kılıyor, böylece "ne zaman, hangi politikayla, kaç kayıt silindi" bilgisi asla kaybolmuyor.

**Alternatives considered**: RLS policy'lerini gevşetip super_admin'e DELETE izni vermek — reddedildi; bu, herhangi bir super_admin'in audit_log'u keyfi olarak (retention politikası dışında) silebilmesine yol açar, mevcut append-only garantisini gerçekten zayıflatır. SECURITY DEFINER fonksiyon yaklaşımı, silme yetkisini SADECE bu tek, kendiliğinden-loglanan işlem yoluna hapseder.
