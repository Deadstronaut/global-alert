# E2E Test Requirements

Bu dosya kod degistirmeden hazirlanmis E2E test isterleri listesidir. Amac Playwright veya benzeri bir aracla daha sonra otomasyona cevrilebilecek, mevcut Vue/Vite/Pinia/Supabase yapisina uygun akislari netlestirmektir.

## Kapsam ve Kaynaklar

Kaynak dokumanlar:

- `docs/mhewsprd.md`
- `docs/21_structured_srs.md`
- `specs/*/spec.md`
- `src/router/index.js`
- `src/views/*.vue`
- `src/components/admin/*.vue`

Mevcut tech stack:

- Frontend: Vue 3, Vite, Vue Router, Pinia
- Backend/veri: Supabase, Edge Functions, Postgres/RLS
- Unit test altyapisi: Vitest, `tests/unit`
- E2E paketi: Playwright dependency olarak mevcut, fakat `package.json` icinde E2E script tanimli degil

## Test Ortami Varsayimlari

E2E testleri icin en az dort hesap gerekir:

- `super_admin`: tum admin kabiliyetleri
- `country_admin`: kendi ulke kapsami
- `org_admin`: kendi organizasyon kapsami
- `viewer`: admin paneline erismemesi gereken normal kullanici

Seed/veri gereksinimleri:

- En az bir aktif ulke, bolge ve organizasyon
- En az bir aktif hazard type
- En az bir data source
- En az bir public/broadcast CAP alert
- En az bir incident
- En az bir shelter
- En az bir contact
- Audit log olusturabilecek test islemleri

## Onceliklendirme

- P0: Kritik guvenlik, auth, public erisim ve ana alarm akisi
- P1: Operasyonel MHEWS akislari
- P2: Admin, raporlama, veri yonetimi ve edge durumlar
- P3: Gorsel/UX, responsive ve tamamlayici kontroller

## E2E-001 Auth Guard ve Login

Oncelik: P0

Ilgili isterler: `specs/004-admin-access-hardening`, `specs/005-mfa-login`, `docs/mhewsprd.md` US28-30

Adimlar:

1. Oturumsuz kullanici `/` veya `/admin` adresine gider.
2. Sistem `/login` sayfasina yonlendirir.
3. Gecerli kullanici bilgileri ile giris yapilir.
4. Kullanici rolu izin verdigi ilk ekrana ulasir.
5. Logout butonu kullanilir.
6. Korumali route tekrar denenir.

Beklenen:

- Oturumsuz kullanici korumali sayfalara giremez.
- Login basarili ise route guard oturumu kabul eder.
- Logout sonrasi korumali route tekrar login ister.

## E2E-002 Admin Yetki Sinirlari

Oncelik: P0

Ilgili isterler: `specs/004-admin-access-hardening`

Adimlar:

1. `viewer` ile giris yap.
2. `/admin` adresine git.
3. `country_admin` ile giris yap, `/admin` adresine git.
4. `org_admin` ile giris yap, `/admin` adresine git.
5. `super_admin` ile giris yap, `/admin` adresine git.

Beklenen:

- `viewer` admin paneli render edilmeden ana sayfaya yonlendirilir.
- `country_admin`, `org_admin`, `super_admin` admin paneline girebilir.
- Admin tablari role/capability kosullarina gore gorunur.
- Yetkisiz rol icin admin-only data request yapilmamasi ayrica network interception ile dogrulanmalidir.

## E2E-003 MFA Enrollment ve Challenge

Oncelik: P0

Ilgili isterler: `specs/005-mfa-login`

Adimlar:

1. MFA zorunlu role sahip, MFA enroll olmamis kullanici ile giris yap.
2. Sistem kullaniciyi `/account-security` sayfasina yonlendirir.
3. Enrollment akisi baslatilir.
4. QR/setup code goruntulenir ve dogrulama kodu girilir.
5. Recovery code seti olustugu dogrulanir.
6. Cikis yapilip tekrar giris denenir.
7. MFA challenge beklenir.
8. Gecerli TOTP veya recovery code ile tamamlanir.

Beklenen:

- MFA gerektiren rol account-security ekranina zorlanir.
- Aktif ikinci faktor sonrasi login ikinci kod ister.
- SMS tabanli MFA secenegi yoktur.
- Recovery code tek kullanimliktir.

## E2E-004 Public Portal Erisimi

Oncelik: P0

Ilgili isterler: `docs/mhewsprd.md` US21, `specs/064-public-cap-feed`, `specs/063-web-push-notifications`

Adimlar:

1. Oturumsuz kullanici `/portal` adresine gider.
2. Aktif public alert listesi goruntulenir.
3. Alert kartinda title, description, hazard type, severity, area, issued/expires bilgileri kontrol edilir.
4. Web push alaninda ulke secimi yapilir.
5. Browser permission mock ile subscribe/unsubscribe akisi denenir.

Beklenen:

- Portal login istemez.
- Broadcast/public alertler gorunur.
- Expired veya public olmayan alertler listelenmez.
- Push abonelik islemi basarili/hata durumunu kullaniciya gosterir.

## E2E-005 Anonymous Community Report

Oncelik: P0

Ilgili isterler: `specs/036-community-hazard-reporting`

Adimlar:

1. Oturumsuz kullanici `/report` adresine gider.
2. Zorunlu alanlar bosken submit denenir.
3. Gecerli hazard, konum, aciklama ve iletisim bilgisi ile rapor gonderilir.
4. Admin moderasyon panelinde raporun bekleyen durumda gorunmesi kontrol edilir.

Beklenen:

- Rapor formu login istemez.
- Zorunlu alan validasyonlari gorunur.
- Basarili rapor moderation kuyruğuna duser.
- Admin tarafi raporu kabul/red/assign durumlarina tasiyabilir.

## E2E-006 Main Map ve Layer Kontrolleri

Oncelik: P1

Ilgili isterler: `docs/mhewsprd.md` Req4, `specs/042-exposure-layer-map-visualization`, `specs/045-hexagon-resolution-panel`, `specs/046-population-hex-labels-provinces`

Adimlar:

1. Authenticated kullanici `/map` adresine gider.
2. Harita/globe ana yuzeyi render olur.
3. Hazard/exposure/forecast/flow layer kontrolleri acilip kapatilir.
4. Bir event secilir.
5. Event detay paneli, impact/exposure bilgileri ve varsa halo/cascade bilgileri kontrol edilir.
6. `/TR/map` gibi country-scoped route denenir.

Beklenen:

- Ana harita bos veya hatali render olmaz.
- Layer toggle islemleri mevcut katmani bozmadan calisir.
- Country route ulke kapsamli layer/veri davranisini uygular.
- Verisi olmayan layer icin explicit empty/unavailable state vardir.

## E2E-007 Data Source Health ve Admin Source CRUD

Oncelik: P1

Ilgili isterler: `specs/001-data-ingestion-monitoring`, `specs/002-source-scoping`, `specs/003-gdacs-source`

Adimlar:

1. Admin `/admin?tab=sources` adresine gider.
2. Source listesi, health state, last success/failure alanlari kontrol edilir.
3. Yeni source formu acilir.
4. Gecerli source kaydedilir.
5. Source disable/reactivate veya remove akisi test edilir.
6. Source audit detaylari acilir.

Beklenen:

- Kaynak ekleme kod degisikligi gerektirmez.
- Health dashboard healthy/degraded/down/disabled durumlarini ayirt eder.
- Disable explicit admin aksiyonudur.
- Audit history ilgili state degisimlerini gosterir.

## E2E-008 Hazard Taxonomy ve Threshold Yonetimi

Oncelik: P1

Ilgili isterler: `specs/010-hazard-taxonomy-admin`, `specs/020-regional-threshold-overrides`, `specs/024-hazard-taxonomy-hierarchy`

Adimlar:

1. `super_admin` veya capability verilen admin `/admin?tab=hazardTaxonomy` adresine gider.
2. Hazard type olusturulur.
3. Duplicate code ile tekrar olusturma denenir.
4. Threshold breakpoint degerleri gecerli sirada kaydedilir.
5. Gecersiz siralama ile kayit denenir.
6. Parent-child iliski ve deactivate akisi kontrol edilir.
7. `/hazards` ekraninda aktif hazard kartlari gorunur.

Beklenen:

- Hazard code unique kalir.
- Hard delete yerine deactivate uygulanir.
- Threshold validasyonu ascending breakpoint kurallarini uygular.
- Viewer `/hazards` okuyabilir, admin edit alanina giremez.

## E2E-009 CAP Draft, Lifecycle ve Export

Oncelik: P0

Ilgili isterler: `specs/006-cap-alert-authoring`, `specs/014-cap-v12-envelope-export`, `docs/mhewsprd.md` US16-18

Adimlar:

1. Operator/admin `/alerts/cap` adresine gider.
2. Zorunlu alanlar bosken draft olusturma denenir.
3. Gecerli hazard, severity, urgency, certainty, area, effective/expires bilgileriyle draft olusturulur.
4. Draft lifecycle butonlari ile review/approve/broadcast akisi denenir.
5. Update/cancel akisi varsa references kontrol edilir.
6. CAP XML/export paketi indirilir veya goruntulenir.

Beklenen:

- Zorunlu CAP alanlari enforced edilir.
- Gecersiz CAP publish edilemez.
- Lifecycle state machine gecersiz gecisleri engeller.
- Export CAP v1.2 alanlarini ve encoding'i dogru uretir.

## E2E-010 Drill Mode CAP Isolation

Oncelik: P0

Ilgili isterler: `specs/013-drill-mode-cap`, `docs/mhewsprd.md` US34-35

Adimlar:

1. Admin `/admin?tab=drill` ekraninda aktif drill baslatir.
2. Drill sirasinda CAP draft olusturulur.
3. Alert status/indicator kontrol edilir.
4. Broadcast denenir.
5. Drill sonlandirilir, summary kontrol edilir.

Beklenen:

- Drill sirasinda olusan CAP `Exercise`/exercise olarak isaretlenir.
- Exercise alert gercek email/WhatsApp dispatch tetiklemez.
- UI her durumda belirgin exercise indicator gosterir.
- Drill summary alert sayisini dogru gosterir.

## E2E-011 Dissemination Contacts ve Dispatch Monitor

Oncelik: P1

Ilgili isterler: `specs/009-dissemination-dispatch`, `specs/015-region-dispatch-targeting`, `specs/060-demographic-audience-targeting`

Adimlar:

1. Admin `/admin?tab=contacts` ekraninda contact olusturur.
2. Region ve demographic tag alanlari atanir.
3. CAP hedef bolge/demographic secimiyle publish edilir.
4. `/admin?tab=dispatch` ekraninda dispatch job ve receipt durumlari izlenir.

Beklenen:

- Contact scope ve demographic filtreleri hedef kitleyi etkiler.
- Seçilmeyen kanallar tetiklenmez.
- Dispatch status sent/delivered/failed gibi durumlari ayirt eder.
- Failure kullaniciya gorunur ve audit/receipt ile izlenebilir.

## E2E-012 Incident Lifecycle

Oncelik: P1

Ilgili isterler: `specs/011-incident-tracking-completion`, `specs/026-incident-timeline-reports`, `docs/mhewsprd.md` US22-24

Adimlar:

1. `/alerts/incidents` ekraninda yeni incident olustur.
2. Monitoring -> Warning -> Closed gibi gecerli gecisleri uygula.
3. Gecersiz state skip denemesi yap.
4. Timeline/report alanlarini kontrol et.
5. CAP alert ile incident iliskisi varsa dogrula.

Beklenen:

- Gecersiz lifecycle gecisi engellenir.
- Her gecis audit/timeline kaydina duser.
- Closed incident icin beklenen after-action/report alanlari gorunur.

## E2E-013 Audit, Evidence ve Access Review

Oncelik: P0

Ilgili isterler: `specs/007-audit-compliance`, `specs/019-scheduled-compliance-reports`, `specs/029-audit-log-resilience`, `specs/035-audit-compliance-retention`

Adimlar:

1. Admin rol/deger degisimi, CAP draft, dispatch veya source update gibi audit ureten islemler yapar.
2. `/admin?tab=audit` ekranina gider.
3. Filtreleme ve sayfalama denenir.
4. Access review CSV/JSON export alinir.
5. Evidence package veya compliance report export denenir.
6. Audit integrity verify aksiyonu varsa calistirilir.

Beklenen:

- Kritik aksiyonlar user/time/action detaylariyla audit log'a yansir.
- Export dosyalari beklenen kolon/alanlari icerir.
- Integrity/tamper kontrolu sonucu gorunur.
- Retention policy UI veya config durumu dogrulanabilir.

## E2E-014 Exposure, Impact ve Risk

Oncelik: P1

Ilgili isterler: `specs/008-impact-analysis`, `specs/023-shapefile-exposure-upload`, `specs/034-impact-analysis-gaps`, `specs/039-risk-scenario-modeling`, `specs/048-cascading-hazard-risk`, `specs/049-cascade-map-and-auto-alert`, `specs/050-hazard-impact-halo-visualization`

Adimlar:

1. Admin `/admin?tab=exposure` ekraninda exposure dataset yukler veya mevcut dataset secer.
2. Gecersiz dosya/metadata validasyonu denenir.
3. Ana haritada event secilip impact paneli acilir.
4. Risk/cascade admin ekraninda rule olusturulur.
5. Event icin cascade evaluation sonucu map/panelde kontrol edilir.

Beklenen:

- Exposure upload validation MIME, geometry, coordinate ve required fields kurallarini uygular.
- Impact metrics affected population/assets gibi ozetleri gosterir.
- Veri olmayan durumda misleading zero yerine explicit no data gorunur.
- Cascade sonucunda triggered/not triggered/not evaluable durumlari ayrilir.
- Auto-evaluation hicbir kosulda otomatik CAP broadcast yaratmaz.

## E2E-015 Shelters ve Resource Inventory

Oncelik: P1

Ilgili isterler: `specs/021-shelter-management`, `specs/027-shelter-map-display`, `specs/062-resource-capacity-inventory`

Adimlar:

1. `/shelters` ekraninda public/authenticated read-only shelter bilgileri goruntulenir.
2. Admin shelter olusturma, update, deactivate/reactivate akisini dener.
3. Capacity/occupancy/status filtreleme ve siralama denenir.
4. Resource inventory tabinda resource CRUD akisi denenir.

Beklenen:

- Shelter availability bilgisi viewer icin okunabilir.
- CRUD sadece yetkili admin icin vardir.
- Occupancy ve confidence/status gorsel durumlari dogru hesaplanir.
- Resource inventory shelter/contact davranisini bozmaz.

## E2E-016 Forecast ve Flow Visualization

Oncelik: P1

Ilgili isterler: `specs/053-wind-flow-visualization`, `specs/054-flow-visualization-modes`, `specs/055-hazard-forecasting-dashboard`, `specs/056-forecast-map-display`

Adimlar:

1. Ana harita veya dashboard forecast paneli acilir.
2. 15 gun, 1 ay, 3 ay horizon secimleri denenir.
3. Region secilir.
4. Forecast day/variable selector ile overlay degistirilir.
5. Flow mode air/ocean/overlay kontrolleri denenir.

Beklenen:

- Deterministic ve probabilistic forecast birbirinden acikca ayrilir.
- `as of` veya data timestamp gorunur.
- Unconfigured/unavailable horizon bos chart gibi gorunmez.
- Forecast overlay kapatildiginda mevcut current-condition layer bozulmaz.
- Flow data stale/unavailable durumlari explicit gorunur.

## E2E-017 Integrations ve Credential Gizliligi

Oncelik: P1

Ilgili isterler: `specs/022-whatsapp-integration-credentials`, `specs/025-generic-integration-credentials`, `specs/066-credential-pending-integrations`

Adimlar:

1. Admin `/admin?tab=integrations` ekranina gider.
2. Eksik credential alanlariyla kayit denenir.
3. Gecerli credential kaydedilir.
4. Sayfa yenilenir.
5. Credential tekrar goruntulenmeye calisilir.
6. Farkli ulke/organizasyon scope ile erisim denenir.

Beklenen:

- Credential secret degeri tekrar gosterilmez.
- Eksik alanlar reddedilir.
- Scope disi credential goruntulenemez veya degistirilemez.
- Credential durumu dispatch veya diger modul davranisini beklenmedik sekilde bozmaz.

## E2E-018 CAP Inbound ve Public Feed

Oncelik: P2

Ilgili isterler: `specs/064-public-cap-feed`, `specs/065-cap-inbound-ingest`

Adimlar:

1. Public CAP feed unauthenticated/authenticated access kurallarina gore denenir.
2. Admin `/admin?tab=capInbound` ekraninda inbound CAP kayitlarini goruntuler.
3. Gecerli CAP inbound payload islenir.
4. Gecersiz CAP payload islenir.

Beklenen:

- Public feed sadece broadcast/public CAP kayitlarini sunar.
- Inbound ingest valid CAP kaydeder, invalid CAP'i reject/audit eder.
- CAP XML parsing guvenli ve schema uyumludur.

## E2E-019 Accessibility, Locale ve Responsive Smoke

Oncelik: P2

Ilgili isterler: `docs/21_structured_srs.md` NFR UX, `README.md`

Adimlar:

1. Kritik sayfalar desktop ve mobile viewport ile acilir: `/login`, `/portal`, `/map`, `/admin`, `/alerts/cap`, `/report`.
2. Keyboard-only navigation smoke testi yapilir.
3. Dil degistirme varsa EN/TR/FR gibi diller denenir.
4. High contrast/colorblind/safe mode gibi UI ayarlari varsa denenir.

Beklenen:

- Kritik buton/form kontrolleri klavye ile erisilebilir.
- Mobile viewport'ta metinler tasmaz ve ana workflow bozulmaz.
- Locale degisimi ana metinleri gunceller.
- Harita/portal kontrast ve renk sinyalleri yalniz renge bagimli kalmaz.

## E2E-020 Golden Path

Oncelik: P0

Ilgili isterler: MHEWS end-to-end pipeline

Adimlar:

1. Admin data source sagligini kontrol eder.
2. Hazard threshold/taxonomy bilgisi dogrulanir.
3. Manual veya seeded hazard event ile olay yaratilir.
4. Impact/risk bilgisi incelenir.
5. Incident olusturulur.
6. CAP draft hazirlanir.
7. CAP onaylanir.
8. Public portal ve dispatch monitor kontrol edilir.
9. Audit/evidence export alinir.

Beklenen:

- Monitoring -> incident -> CAP -> dissemination -> public portal -> audit zinciri kopmadan calisir.
- Her kritik asamada explicit status ve hata gorunur.
- Drill mode kapaliyken normal dispatch, drill mode acikken isolated exercise davranisi dogrulanir.

## Otomasyona Donusturme Notlari

- Testler role-based fixture ile yazilmali.
- Supabase network istekleri icin deterministic seed veya test project kullanilmali.
- Stabil selector eksigi var; test automation asamasinda UI koduna `data-testid` eklemek gerekebilir. Bu dokuman asamasinda kod degistirilmemistir.
- Harita/globe testleri icin sadece DOM degil canvas/screenshot smoke kontrolu de gerekir.
- Destructive islemler test ortaminda soft-delete/deactivate kayitlariyla sinirlanmali.

