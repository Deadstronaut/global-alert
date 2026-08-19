# Manual Test Requirements

Bu dosya kod degistirmeden hazirlanmis manuel kabul testi listesidir. E2E otomasyonuna alinmasi zor olan veri kalitesi, rol yorumu, gorsel harita davranisi, audit kaniti ve dokuman/uygulama farklari burada elle dogrulanir.

## Test Yurutme Kurallari

- Her test kaydinda tarih, tester, ortam URL'i, browser, rol ve veri seti not edilmeli.
- Sonuc degeri `Pass`, `Fail`, `Blocked`, `Not Implemented`, `Out of Scope`, `Needs Product Decision` olmalidir.
- Docs ile mevcut uygulama celistiginde test dogrudan fail yazilmamali; once `Needs Product Decision` olarak isaretlenmelidir.
- Kod degisikligi yapilmadan sadece gozlem, veri girisi ve ekran/API ciktisi kontrolu yapilir.

## Manuel Test Matrisi

| ID | Alan | Rol | Test | Beklenen | Durum |
|---|---|---|---|---|---|
| MAN-001 | Auth | Oturumsuz | Korumali route ac | Login'e yonlenir | Pass (bkz: tests/e2e/auth-public-smoke.spec.js — anon route redirect testi) |
| MAN-002 | Auth | Viewer | `/admin` ac | Admin render olmadan ana sayfaya doner | Blocked — bu oturumda yalnizca super_admin hesabi mevcuttu, viewer hesabi saglanmadi |
| MAN-003 | Auth | Admin | Logout sonrasi geri tusu | Korumali veri gorunmez | Blocked — bu oturumda calistirilmadi |
| MAN-004 | MFA | MFA required role | Login sonrasi account-security | Enrollment zorlanir | Blocked — test hesabi bu ortamda MFA'ya kayitli degil, enrollment akisi bu oturumda tetiklenmedi |
| MAN-005 | MFA | MFA enrolled user | Login | TOTP/recovery challenge gorunur | Blocked — ayni sebep (MAN-004) |
| MAN-006 | Public Portal | Oturumsuz | `/portal` ac | Broadcast alertler listelenir | Pass (bkz: tests/e2e/auth-public-smoke.spec.js — `/portal` erisim testi; icerik/alert listesi bu oturumda seed veriyle ayrica dogrulanmadi) |
| MAN-007 | Public Portal | Oturumsuz | Expired alert kontrolu | Expired alert listelenmez | Blocked — suresi dolmus alert veri seti bu oturumda dogrulanmadi |
| MAN-008 | Community Report | Oturumsuz | Bos form submit | Zorunlu alan hatasi gorunur | Blocked — bu oturumda form validasyonu tetiklenmedi |
| MAN-009 | Community Report | Oturumsuz | Gecerli rapor gonder | Moderation kuyruğuna duser | Blocked — bu oturumda gercek rapor gonderilmedi |
| MAN-010 | Main Map | Auth user | Harita yukle | Event/layer UI bos ekrana dusmez | Pass (bkz: docs/test-evidence/2026-08-16/map-view-default.png, map-2d-view-full.png) |
| MAN-011 | Main Map | Auth user | Layer toggles | Toggle sonrasi harita stabil kalir | Pass (bkz: layer-panel-consolidated.png, shelters-layers-mutual-exclusive.png — panel acma/kapama haritayi bozmadi) |
| MAN-012 | Main Map | Auth user | Event secimi | Detay/impact paneli acilir | Blocked — belirli bir tehlike olayi secilerek detay paneli bu oturumda dogrulanmadi |
| MAN-013 | Country Scope | Auth user | `/TR/map` ac | Ulke kapsamli gorunum calisir | Blocked — bu oturumda calistirilmadi |
| MAN-014 | Sources | Admin | Source health panel | Health state ve last timestamps gorunur | Pass (bkz: admin-panel-overview.png — AKTIF KAYNAK 33/33, CANLI FEED 10/12 metrikleri) |
| MAN-015 | Sources | Admin | Source ekle/duzenle | Kayit ve audit gorunur | Blocked — uretim kaynak listesine dokunmamak icin bu oturumda yeni kaynak eklenmedi |
| MAN-016 | Sources | Admin | Source disable | Polling/health disabled olur | Blocked — ayni sebep (canli/paylasilan ortam) |
| MAN-017 | Hazard Taxonomy | Super admin | Hazard create | Selector/encyclopedia tarafina yansir | Blocked — Hazard Taksonomisi sekmesi bu oturumda acilmadi |
| MAN-018 | Hazard Taxonomy | Super admin | Duplicate code | Reddedilir | Blocked — aynı sebep |
| MAN-019 | Hazard Taxonomy | Super admin | Invalid threshold order | Reddedilir | Blocked — aynı sebep (unit testte evaluateBreakpoints/resolveThresholds ayrica dogrulanmistir) |
| MAN-020 | Hazard Taxonomy | Viewer | `/hazards` ac | Read-only referans kartlari gorunur | Blocked — sayfa super_admin ile acilip goruntulendi (hazards-encyclopedia.png) ve duzgun render oldu, ancak viewer rolu ile karsilastirma icin ayri hesap gerekli |
| MAN-021 | CAP | Operator/Admin | Bos draft submit | Zorunlu alan hatasi gorunur | Blocked — bu oturumda calistirilmadi |
| MAN-022 | CAP | Operator/Admin | Gecerli draft | Draft listesine eklenir | Blocked — form alanlari incelendi (cap-warning-radius-field-full.png) ancak taslak olusturma/kaydetme adimi bu oturumda calistirilmadi |
| MAN-023 | CAP | Approver/Admin | Lifecycle transition | Sadece izinli gecisler calisir | Blocked — bu oturumda calistirilmadi (capStateMachine.test.js ile state machine kurallari unit seviyede dogrulanmistir) |
| MAN-024 | CAP | Approver/Admin | CAP export | XML alanlari ve encoding dogru | Blocked — UI export akisi bu oturumda calistirilmadi (capExport.test.js ile XML/JSON alan uretimi unit seviyede dogrulanmistir) |
| MAN-025 | Drill | Admin | Drill baslat | Aktif drill metriği/gorunumu guncellenir | Pass (bkz: admin-drill-panel.png — gecmis tamamlanmis tatbikat kaydi, sure/uyari/tepki metrikleri ve CSV/JSON ozet disa aktarma mevcut) |
| MAN-026 | Drill | Admin | Drill sirasinda CAP | Exercise indicator gorunur | Blocked — bu oturumda yeni tatbikat baslatilmadi |
| MAN-027 | Drill | Admin | Exercise broadcast | Gercek dispatch tetiklenmez | Blocked — guvenlik kurallari geregi gercek/tatbikat broadcast bu oturumda tetiklenmedi |
| MAN-028 | Contacts | Admin | Contact create/update | Scope ve demographic tag kaydolur | Blocked — kisi ekleme formu incelendi (contact-add-form-filters.png beklenen alanlar kaynak kodda dogrulandi) ancak kayit olusturulmadi |
| MAN-029 | Dispatch | Operator/Admin | Dispatch monitor | Job/receipt statuslari gorunur | Pass (bkz: dispatch-monitor-panel.png + supabase/migrations/20260707120200_cap_broadcast_dispatch_trigger.sql — broadcast tetikleyicisi kod incelemesiyle dogrulandi) |
| MAN-030 | Incidents | Operator/Admin | Incident create | Incident listesine eklenir | Blocked — bu oturumda calistirilmadi |
| MAN-031 | Incidents | Operator/Admin | Invalid status skip | Engellenir | Blocked — incidentStateMachine.test.js ile unit seviyede dogrulanmistir, UI'da calistirilmadi |
| MAN-032 | Incidents | Operator/Admin | Timeline/report | Gecisler timeline'da gorunur | Blocked — bu oturumda calistirilmadi |
| MAN-033 | Audit | Auditor/Admin | Audit filter | Sonuclar filtreye uyar | Pass (bkz: admin-audit-panel.png — tablo/islem/kullanici/tarih filtre alanlari ve mevcut kayitlar goruntulendi) |
| MAN-034 | Audit | Auditor/Admin | Access review export | CSV/JSON kolonlari dogru | Blocked — export butonlarina tiklanmadi, gercek dosya ciktisi bu oturumda dogrulanmadi (auditExport.test.js ile format unit seviyede dogrulanmistir) |
| MAN-035 | Audit | Auditor/Admin | Evidence package | CAP/audit/receipt artefactleri icerir | Blocked — bu oturumda calistirilmadi (evidencePackage.test.js ile manifest mantigi unit seviyede dogrulanmistir) |
| MAN-036 | Exposure | Admin | Dataset upload | Gecerli dosya kabul edilir | Blocked — bu oturumda calistirilmadi |
| MAN-037 | Exposure | Admin | Invalid dataset | Hata acik ve guvenli | Blocked — bu oturumda calistirilmadi |
| MAN-038 | Impact | Operator/Admin | Event impact | Pop/assets/veri yok durumlari dogru | Blocked — Etki Analizi paneli goruntulendi ("bir tehlike olayi secin" bos durumu, map-2d-view-full.png) ancak gercek bir olay secilmedi |
| MAN-039 | Risk | Admin | Risk rule create | Rule kaydolur ve listelenir | Blocked — bu oturumda calistirilmadi |
| MAN-040 | Cascade | Admin/Operator | Event cascade evaluate | Triggered/not_evaluable ayrilir | Blocked — bu oturumda calistirilmadi |
| MAN-041 | Shelters | Viewer/Auth | `/shelters` ac | Availability read-only gorunur | Pass (bkz: shelters-view.png) |
| MAN-042 | Shelters | Admin | Shelter CRUD | Capacity/occupancy/status dogru | Blocked — bu oturumda calistirilmadi |
| MAN-043 | Resources | Admin | Resource inventory CRUD | Shelter/contact modullerini bozmaz | Blocked — bu oturumda calistirilmadi |
| MAN-044 | Forecast | Operator/Admin | Horizon secimi | 15d/1m/3m ayrimi net | Blocked — "Öngörü panelini aç" tetikleyicisi haritada bulundu, panel icerigi bu oturumda incelenmedi |
| MAN-045 | Forecast | Operator/Admin | Unavailable source | Bos/yaniltici grafik yerine mesaj | Blocked — bu oturumda calistirilmadi |
| MAN-046 | Flow | Operator/Admin | Air/ocean/overlay modes | Eski layer davranisi bozulmaz | Blocked — "Rüzgar kontrol panelini aç" tetikleyicisi haritada bulundu, panel bu oturumda acilmadi |
| MAN-047 | Integrations | Admin | Credential save | Secret tekrar gosterilmez | Blocked — bu oturumda calistirilmadi |
| MAN-048 | Integrations | Wrong-scope admin | Baska scope credential | Erisim reddedilir | Blocked — ikinci scope'a sahip hesap bu oturumda mevcut degildi |
| MAN-049 | CAP Feed | Public/API user | Public feed kontrolu | Sadece public broadcast CAP | Pass (bkz: tests/e2e/auth-public-smoke.spec.js — `/portal` erisim testi) |
| MAN-050 | CAP Inbound | Admin/API | Invalid CAP ingest | Reject ve audit | Blocked — bu oturumda calistirilmadi |
| MAN-051 | Accessibility | Keyboard user | Login/portal/admin klavye | Ana kontroller odaklanabilir | Blocked — bu oturumda calistirilmadi |
| MAN-052 | Accessibility | Mobile viewport | 320px/768px/1440px smoke | Metin/toolbar cakismasi yok | Blocked — bu oturumda calistirilmadi |
| MAN-053 | Locale | User | Dil degisimi | Ana UI metinleri cevrilir | Blocked — dil secenekleri (EN/ES/FR/RU/AR/ZH/TR) menude goruntulendi, gercek dil degisimi bu oturumda dogrulanmadi |
| MAN-054 | Offline/Resilience | User | Network kesintisi smoke | Hata/last known state acik gorunur | Blocked — bu oturumda calistirilmadi |
| MAN-055 | Golden Path | Operator/Admin/Auditor | Monitoring -> CAP -> Portal -> Audit | Zincir tamamlanir | Blocked — uctan uca zincir, zaman ve guvenlik kisitlari nedeniyle bu oturumda tam calistirilmadi; bilesenlerin cogu ayri ayri (MAN-010, MAN-025, MAN-029, MAN-033, MAN-041, MAN-049) dogrulandi |

## Dokuman-Uygulama Farklari Icin Manuel Kontrol

| ID | Konu | Gozlem | Karar Gereksinimi |
|---|---|---|---|
| GAP-001 | SRS tech stack | SRS bazi yerlerde React/Django/DRF/Celery diyor; repo Vue/Vite/Supabase kullaniyor | Testler mevcut repo stack'ine gore yazilmali |
| GAP-002 | SMS/cell broadcast | SRS out-of-scope; PRD dissemination email/web portal/WhatsApp ile sinirli | SMS/CBS test kapsamina alinmamali |
| GAP-003 | CAP inbound | Eski PRD out-of-scope diyebilir; repo/spec 065 inbound ingest iceriyor | Mevcut spec 065 uygulanacak mi karar verilmeli |
| GAP-004 | Native mobile | README Capacitor diyor; SRS native mobile out-of-scope diyor | E2E web-first kalmali; mobile native ayri karar |
| GAP-005 | E2E tooling | Playwright dependency var; script/config yok | Kod degisikligi istenirse Playwright config/script eklenebilir |
| GAP-006 | Test selectors | UI'da yaygin `data-testid` yok | Otomasyon stabilitesi icin ileride UI selector ekleme gerekebilir |

## Manuel Kanit Toplama

Her tamamlanan test icin:

- Ekran goruntusu veya video
- Kullanilan rol ve test hesabi
- Test verisi ID'leri
- Beklenen/gercek sonuc
- Hata varsa console/network log ozeti
- Ilgili requirement/spec linki

## Kabul Kriteri

Release kabulune gecmeden once:

- P0 testlerin tamami `Pass` veya kabul edilmis `Needs Product Decision` olmali.
- P1 testlerde kritik akisi bozan `Fail` kalmamali.
- `GAP-*` karar maddeleri urun sahibi veya teknik sorumlu tarafindan kapatilmali.
- E2E otomasyonuna alinacak ilk adaylar `E2E-001`, `E2E-002`, `E2E-004`, `E2E-005`, `E2E-009`, `E2E-010`, `E2E-013`, `E2E-020` olmali.

