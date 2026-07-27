# Federe Kurulum Planı (Katman 1) — İş Planı

**Durum:** Taslak / planlama aşaması — henüz implementasyona başlanmadı.
**Tarih:** 2026-07-25
**İlgili:** [NEW_GAME_PLAN.md](./NEW_GAME_PLAN.md) (Katman 2 — kaynak sıklık seçimi — tamamlandı, bkz. commit `0e0a60b`)

## 1. Sorunun tanımı

Şu an sistemde **tek bir** merkezi kurulum var: bizim Supabase Cloud projemiz +
bizim Windows makinemizdeki Docker (`aggregator`, `raster-importer` ailesi,
`netcdf-service`). Türkiye/Malezya/Madagaskar hepsi bunun üzerinde
`country_code` ile ayrışıyor — super_admin (biz) hepsini görebiliyor, bu da
şu anki test/geliştirme sürecinde istenen bir şey.

**Hedef:** Her ülke kendi altyapısını (kendi VPS'i, kendi self-hosted
Supabase'i, kendi Docker'ı) kursun ve işletsin — muhtemelen bulut değil,
kendi sunucuları (egemenlik/veri lokasyonu kaygısı olabilir, doğrulanmadı,
varsayım). Biz onlara "paket" + kurulum sihirbazı + dokümantasyon veririz;
onlar kendi sistem adminleriyle kurar, çalıştırır.

## 2. Zaten var olan, plana dahil edilecek parçalar

Kod tabanını inceledim — kullanıcının tarif ettiği "kripto sistemi" ve rol
hiyerarşisi **büyük ölçüde zaten yazılmış ve çalışıyor**:

- **Davet/kimlik doğrulama:** `supabase/functions/create-user/index.ts` →
  Supabase'in kendi `auth.admin.inviteUserByEmail()` mekanizmasını kullanıyor.
  Admin şifre belirlemiyor, davet edilen kullanıcı e-postasına gelen güvenli
  bir linkle kendi şifresini kuruyor. **Ayrı bir kripto sistemi kurmaya
  gerek yok** — Supabase Auth bunu zaten endüstri standardında yapıyor
  (magic link + JWT), self-hosted Supabase'de de aynı mekanizma çalışır.
- **Rol hiyerarşisi:** `supabase/functions/shared/createUserAuthorization.ts`
  → `super_admin` (her şeyi görür/oluşturur) → `country_admin` (sadece kendi
  ülkesi, sadece `org_admin`/`viewer` oluşturabilir) → `org_admin` (sadece
  kendi ülke+org'u, sadece `viewer` oluşturabilir) → `viewer`. Bu, tam olarak
  "Madagaskar'ın sistem admini kendi altındaki AFAD/Orman Bakanlığı'na
  sınırlı yetki verir" senaryosu — **zaten kodda var, çalışıyor.**
- **Dar kapsamlı ek yetkiler:** `specs/018-admin-capability-grants/` →
  belirli admin panel alanlarını (Hazard Taxonomy, SOP Repository, Map
  Layers, Audit) tek tek açıp kapatma. "Alarm basabilir ama başka bir şey
  yapamaz" tarzı ince ayarlı izinler için genişletilebilecek bir temel var.

**Sonuç:** Katman 1'in "kullanıcı/rol/davet" tarafı yeniden icat edilmeyecek
— zaten sağlam. Asıl eksik olan, **bu sistemi bambaşka bir sunucuda sıfırdan
ayağa kaldırma** (deployment/provisioning) tarafı.

## 3. Gerçekten eksik olan parçalar

### 3.1 Kurulum sihirbazı (yeni)
Bir ülkenin sistem admini için uçtan uca akış:
1. Bize (bir form/e-posta ile) erişim talebinde bulunur.
2. Biz onlara ilk `country_admin` hesabını **mevcut `create-user`
   Edge Function'ı üzerinden** (kendi sistemimizden, tek seferlik) daveti
   göndeririz — bu adım için yeni kod gerekmiyor, sadece süreç/prosedür.
3. Sistem admini kendi VPS'ini hazırlar (domain, SSL sertifikası).
4. Bizim vereceğimiz kurulum paketini çalıştırır: bir script/sihirbaz —
   - Self-hosted Supabase'i (Docker Compose ile, Supabase'in kendi resmi
     self-host şablonu) ayağa kaldırır
   - Bu repodaki `docker-compose.yml`'i kendi ortamına uyarlar (env
     değişkenleri: kendi Supabase URL/anahtarları, kendi domaini)
   - Migration'ları kendi Supabase'ine uygular (`supabase db push`)
   - Edge Functions'ı kendi Supabase'ine deploy eder
   - Frontend'i kendi domaininde build/serve eder
5. Kurulum bitince sihirbaz, adımdaki `country_admin` hesabıyla giriş
   yapmasını ister — buradan sonrası zaten var olan rol hiyerarşisiyle
   yürür (country_admin kendi org adminlerini kendisi davet eder).

**Yeni yazılması gerekenler:**
- Kurulum script'i (muhtemelen bash/PowerShell + `supabase` CLI +
  `docker compose` çağrıları zinciri, interaktif prompt'larla domain/env
  toplayan)
- Env template'lerinin self-host'a göre parametreleştirilmesi (şu an
  `.env`'ler tek bir Supabase Cloud projesine göre yazılmış — bkz.
  `supabase/.temp/project-ref`, `SUPABASE_URL` sabit varsayımları)
- Kurulum dokümantasyonu (adım adım, teknik olmayan bir sistem admininin
  takip edebileceği düzeyde)

### 3.2 "İlk hesap" bootstrap problemi (yeni, dikkat gerektirir)
Şu an HER hesap, var olan bir admin tarafından davet ediliyor
(`create-user` çağıran kişinin zaten `super_admin`/`country_admin` olması
gerekiyor — `createUserAuthorization.ts`). Yeni bir self-hosted kurulumda
**ilk** `country_admin` hesabını kim davet edecek? İki seçenek:
- (a) Biz (merkezi ekip) manuel olarak, kurulum sırasında bir kerelik
  script ile o kişinin profiline direkt `country_admin` rolü yazarız
  (RLS'i bypass eden service-role bir seed script — tehlikeli, dikkatli
  yazılmalı, sadece kurulum sihirbazının kendi akışında çalışmalı)
- (b) Kurulum script'i kendi ortamında ilk hesabı otomatik oluşturur
  (env'den email/şifre okuyarak), sistem admini ilk girişte şifresini
  değiştirir

(b) daha güvenli ve "sihirbaz" hissine daha uygun — **önerilen yaklaşım.**

### 3.3 Self-hosted Supabase uyumluluğu (doğrulanmalı)
Kod tabanı `@supabase/supabase-js` ile standart REST/Auth/Realtime
çağırıyor — self-hosted Supabase aynı API yüzeyini sunduğu için teorik
olarak "sadece URL/anahtar değişir" olmalı. Ama doğrulanmadı:
- `pg_cron`/`pg_net`/Vault (bu repo ağır kullanıyor — GDO/GHSL/GloFAS
  tetikleyicileri hep bunlara dayanıyor) self-hosted Supabase'de varsayılan
  olarak gelmeyebilir, ayrı kurulmaları gerekebilir
- Edge Functions self-hosted ortamda Deno runtime'ı kendi container'ında
  çalıştırır (`supabase functions serve` / self-host'un edge-runtime
  container'ı) — bugün yaşadığımız `node:vm` bundling sorunu (bkz.
  commit `eca72bd`) self-host'ta da aynen çıkabilir, hatta farklı
  davranabilir

Bu madde **ilk gerçek self-host denemesinde** doğrulanmalı — teorik olarak
plana yazıyoruz ama bir sürpriz riski var.

## 4. Önerilen sıralama (bu büyüklükte bir iş tek seferde yapılmaz)

1. **Deneme self-host kurulumu** (bu makinede veya bir test VPS'inde,
   gerçek bir ülke olmadan) — 3.3'teki varsayımları doğrula
2. **İlk-hesap bootstrap script'i** (3.2) — küçük, izole, test edilebilir
3. **Kurulum script'inin ilk versiyonu** (3.1) — muhtemelen Türkiye/
   Madagaskar için zaten kurulu olanı "yeniden kurulum" gibi simüle ederek
   test edilir
4. **Dokümantasyon** — script stabilize olduktan sonra yazılır (önce yazıp
   sonra script'i ona uydurmak tersten gider)

## 4.1 Yeni hazard type ekleme (self-servis, 20260727'de eklendi)

Bir ülke admini yeni bir hazard type (örn. "toprak kayması") eklemek istediğinde: Hazard Taksonomisi panelinden ekler, "Kaynak Ekle"den bir kaynak bağlar — hiçbir migration/kod değişikliği gerekmez, olay otomatik olarak genel `disaster` kova tablosuna düşer, ikon/etiket taksonomi kaydından dinamik okunur. Bir ülke bu tipi kendi özel tablosuna "yükseltmek" isterse (yüksek hacim/önem durumunda), [HAZARD_TABLE_TEMPLATE.md](./HAZARD_TABLE_TEMPLATE.md)'deki kopyala-yapıştır şablonunu izler.

## 5. Açık sorular (henüz karar verilmedi)

- Self-host maliyeti/karmaşıklığı bazı ülkeler için fazla gelirse, "biz
  onlar için de barındıralım ama veri onlara ait olsun" gibi bir orta yol
  sunulacak mı? (Hibrit model — önceki tartışmada bahsedildi, karara
  bağlanmadı.)
- Federe kurulumlar arası bir görünürlük/merkezi izleme katmanı olacak mı
  (örn. "hangi ülkenin sistemi ayakta, hangisi degrade" diye bizim
  görebileceğimiz bir panel)? Yoksa her kurulum tamamen izole mi kalacak?
