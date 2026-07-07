# Quickstart: Vatandaş Kaynaklı Afet Bildirimi

Bu doğrulama, migration'ların uygulanmış ve `submit-community-report` Edge Function'ının deploy
edilmiş olduğu bir Supabase ortamı varsayar (staging veya kullanıcı onaylı bir prod push'u sonrası).

## Ön koşullar

- `<timestamp>_community_reports.sql` migration'ı uygulanmış (`npx supabase db push --linked`).
- `submit-community-report` Edge Function'ı deploy edilmiş (`npx supabase functions deploy submit-community-report`).
- `community-report-photos` Storage bucket'ı oluşturulmuş (migration'ın bir parçası veya manuel).
- En az bir `country_admin` test hesabı ve en az bir aktif `hazard_types` kaydı mevcut.

## Senaryo 1 — Anonim gönderim (User Story 1)

1. Kimlik doğrulaması yapmadan `/report` sayfasını aç.
2. Afet tipi seç, açıklama gir, haritadan bir konum işaretle (fotoğrafsız).
3. Gönder.
4. **Beklenen**: "Bildiriminiz incelemeye alındı" onay mesajı görünür.
5. Service-role ile (veya super_admin hesabıyla admin panelinden) doğrula: yeni satır
   `community_reports`'ta `status='pending'`, `country_code` konuma göre doğru atanmış.

## Senaryo 2 — Moderasyon-öncesi görünmezlik (FR-004, SC-004)

1. Senaryo 1'deki bildirim hâlâ `pending` iken, farklı bir tarayıcı oturumunda (veya gizli sekmede)
   giriş yapmadan ana haritayı/`/portal`'ı aç.
2. **Beklenen**: Bildirim hiçbir yerde görünmez.
3. Bir `viewer` hesabıyla giriş yapıp ana haritayı aç.
4. **Beklenen**: Bildirim yine görünmez (yalnızca `approved` durumdakiler görünür).

## Senaryo 3 — Moderasyon (User Story 2)

1. Bildirimin ülkesiyle eşleşen bir `country_admin` hesabıyla giriş yap, AdminView →
   "Vatandaş Bildirimleri" sekmesini aç.
2. Bildirimin kuyrukta göründüğünü doğrula.
3. Gerekçesiz "Reddet" dene → engellenmeli.
4. Gerekçeyle reddet → durum `rejected` olmalı, kuyruktan kalkmalı.
5. Yeni bir test bildirimi gönder (Senaryo 1), bu kez "Onayla" ile onayla → durum `approved`
   olmalı.
6. Başka bir ülkeye ait bir test bildirimi (varsa) bu `country_admin`'in kuyruğunda GÖRÜNMEMELİ.

## Senaryo 4 — Harita katmanı (User Story 3)

1. Senaryo 3'te onaylanan bildirimle, herhangi bir giriş yapmış hesapla ana haritayı aç.
2. **Beklenen**: Bildirim, afet olayı katmanından görsel olarak ayrı bir işaretçi/küme olarak
   görünür; katman kontrolünden gizlenip tekrar gösterilebilir.
3. İşaretçiye/kümeye tıkla → tür/açıklama/zaman (varsa fotoğraf) gösterilmeli.

## Senaryo 5 — Incident bağlama (User Story 4)

1. Kendi kapsamında en az bir incident olan bir `country_admin`/`super_admin` ile, onaylı
   bildirimi mevcut bir incident'a bağla.
2. Incident detay görünümünde bildirimin listelendiğini doğrula.
3. Denetim sekmesinden (Audit) bu bağlama olayının audit_log'da göründüğünü doğrula.

## Senaryo 6 — Geçersiz durum geçişleri (guard trigger)

1. Doğrudan SQL (veya service-role client) ile `approved` bir satırı `pending`'e döndürmeyi dene.
2. **Beklenen**: `invalid_community_report_transition` hatasıyla reddedilir.
3. `rejected` bir satırı `rejection_reason=NULL` ile `rejected` yapmaya (no-op) veya doğrudan
   `approved`'a geçirmeye çalış.
4. **Beklenen**: İkisi de reddedilir.

## Not

T051 (spec 009) ve sonraki tüm spec'lerdeki gibi, migration'ın canlıya (`--linked`) push'u ve
Edge Function deploy'u kullanıcı onayı gerektiren, bu plan/tasks aşamasında YAPILMAYAN, ayrı bir
adımdır.
