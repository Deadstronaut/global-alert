# GEWS — Global Early Warning System
## Tam Sistem Planı & Çalışma Mimarisi

**Versiyon:** 2.0  
**Tarih:** Mayıs 2026  
**Durum:** MVP Aktif — Ürün Fazı Planlanıyor

---

## İçindekiler

1. [Sistem Özeti](#1-sistem-özeti)
2. [Mimari Genel Bakış](#2-mimari-genel-bakış)
3. [Katman 1 — Veri Toplayıcı (Aggregator)](#3-katman-1--veri-toplayıcı)
4. [Katman 2 — Veritabanı (Supabase)](#4-katman-2--veritabanı)
5. [Katman 3 — Frontend (Vue 3)](#5-katman-3--frontend)
6. [Canlı Veri Akışı](#6-canlı-veri-akışı)
7. [Veri Kaynakları](#7-veri-kaynakları)
8. [Deploy Mimarisi](#8-deploy-mimarisi)
9. [Ürün Fazı — Auth & Çok Kiracılı Yapı](#9-ürün-fazı--auth--çok-kiracılı-yapı)
10. [Güvenlik & RLS](#10-güvenlik--rls)

---

## 1. Sistem Özeti

GEWS, küresel afet olaylarını (deprem, yangın, sel, kuraklık, salgın vb.) 12+ yetkili kaynaktan gerçek zamanlı olarak toplayıp, normalleştirerek tek bir interaktif arayüzde sunan erken uyarı platformudur.

**Hedef kullanıcı:** Ulusal afet yönetim birimleri, bakanlıklar, BM kuruluşları.

| Özellik | Değer |
|---|---|
| Afet tipi | 9 (deprem, yangın, sel, kuraklık, gıda güvensizliği, tsunami, siklun, volkan, salgın) |
| Veri kaynağı | 12+ (USGS, EMSC, AFAD, Kandilli, GEOFON, GDACS, PTWC, NASA FIRMS, WHO, FEWSNET, ReliefWeb, RSS) |
| Güncelleme sıklığı | Deprem: 1 dk · Yangın: 15 dk · Sel: 5 dk · Kuraklık: 1 saat |
| Harita görünümü | 3D Globe (Three.js) + 2D Leaflet |
| Dil desteği | 7 dil — BM'nin 6 resmi dili (AR, ZH, EN, FR, RU, ES) + Türkçe |
| Mobil | iOS + Android (Quasar + Cordova) |

---

## 2. Mimari Genel Bakış

```
╔══════════════════════════════════════════════════════════════════════════╗
║                     KATMAN 0 — DIŞ VERİ KAYNAKLARI                     ║
║                                                                          ║
║  🌍 Sismik        🔥 Yangın        🌊 Su          🦠 Sağlık / Gıda      ║
║  USGS · EMSC      NASA FIRMS       GDACS · PTWC   WHO · FEWSNET         ║
║  AFAD · Kandilli  ReliefWeb RSS    GloFAS          FAO · ReliefWeb       ║
║  GEOFON                                                                  ║
╚══════════════════════════════════════════════════════════════════════════╝
                    │ REST · WebSocket · RSS · GeoJSON
                    ▼
╔══════════════════════════════════════════════════════════════════════════╗
║              KATMAN 1 — GEWS AGGREGATOR (Node.js · Docker)              ║
║                                                                          ║
║  ┌──────────────┐   ┌─────────────┐   ┌──────────────────────────────┐  ║
║  │   SOURCES    │──▶│  NORMALIZE  │──▶│       DEDUPLICATOR           │  ║
║  │ 12 poller /  │   │ Ortak şema: │   │ Mesafe + Zaman penceresi     │  ║
║  │  listener    │   │ id,type,lat │   │ Deprem: 20km / 5dk           │  ║
║  │              │   │ lng,mag,sev │   │ Yangın: 5km / 5dk            │  ║
║  │ EMSC: WS     │   │ title,time  │   │ Sel: 20km / 5dk              │  ║
║  │ USGS: REST   │   │ source,extra│   └──────────────┬───────────────┘  ║
║  │ AFAD: REST   │   └─────────────┘                  │                  ║
║  │ Kandilli:REST│                                     ▼                  ║
║  │ GEOFON: REST │   ┌─────────────────────────────────────────────────┐  ║
║  │ GDACS: REST  │   │         P-WAVE ERKEN UYARI MOTORU               │  ║
║  │ PTWC: REST   │   │  M4.0+ depremler → S-dalgası varış süresi      │  ║
║  │ NASA: REST   │   │  500km içindeki şehirlere saniye bazlı uyarı   │  ║
║  │ WHO: REST    │   └──────────────────────────┬──────────────────────┘  ║
║  │ FEWSNET:REST │                              │                         ║
║  │ RSS: Parse   │                              ▼                         ║
║  │ IoT: Config  │   ┌─────────────────────────────────────────────────┐  ║
║  └──────────────┘   │           SUPABASE WRITER                        │  ║
║                     │  2 sn'de bir toplu UPSERT (onConflict: id)      │  ║
║                     │  Tablo: type'a göre earthquake/wildfire/...      │  ║
║                     │  Erken uyarılar: early_warnings tablosuna        │  ║
║                     └──────────────────────────┬──────────────────────┘  ║
║                                                │                         ║
║  HTTP :8765  /health · /status  (ops izleme)   │                         ║
╚════════════════════════════════════════════════╪════════════════════════╝
                                                 │ UPSERT (service_role)
                                                 ▼
╔══════════════════════════════════════════════════════════════════════════╗
║              KATMAN 2 — SUPABASE (PostgreSQL + Realtime)                ║
║                                                                          ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │  TABLOLAR                                                          │  ║
║  │  earthquake · wildfire · flood · drought · food_security           │  ║
║  │  tsunami · cyclone · volcano · epidemic · early_warnings           │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │  VIEW'LAR (geçersiz koordinat filtresi + time DESC)                │  ║
║  │  earthquake_view · wildfire_view · flood_view · drought_view       │  ║
║  │  food_security_view · tsunami_view · cyclone_view · volcano_view   │  ║
║  │  epidemic_view · early_warnings_view                               │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║  ┌────────────────────────────────────────────────────────────────────┐  ║
║  │  RLS POLİTİKALARI                                                  │  ║
║  │  public_read: Tüm tablolar herkese açık SELECT                     │  ║
║  │  Yazma: Yalnızca service_role key (aggregator)                     │  ║
║  └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║  Realtime: INSERT olaylarını subscribe olan tüm frontend'lere yayar     ║
╚════════════════════════════════════════════════╪════════════════════════╝
                                                 │ REST API + Realtime WS
                                                 ▼
╔══════════════════════════════════════════════════════════════════════════╗
║              KATMAN 3 — FRONTEND (Vue 3 + Vite)                         ║
║                                                                          ║
║  App.vue → onMounted → disasterStore.startWebSocket()                   ║
║                                                                          ║
║  ┌─────────────────────────────────────────────────────────────────┐    ║
║  │  BAŞLATMA SIRASI                                                │    ║
║  │  1. IndexedDB cache'den anında yükle (loading ekranı kapanır)  │    ║
║  │  2. Supabase view'lardan delta fetch (son X saat)              │    ║
║  │  3. Supabase Realtime subscribe (canlı INSERT akışı)           │    ║
║  └─────────────────────────────────────────────────────────────────┘    ║
║                                                                          ║
║  ┌──────────────────────┐    ┌────────────────────────────────────┐     ║
║  │   GlobeView          │    │   MapView                          │     ║
║  │   (globe.gl / Three) │    │   (Leaflet 1.9.4)                  │     ║
║  │   · Points           │    │   · Tile layer (dark/light)        │     ║
║  │   · Rings            │    │   · Emoji markers                  │     ║
║  │   · Labels           │    │   · Heatmap (leaflet.heat)         │     ║
║  │   · Heatmap          │    │   · Hexbin (H3 + Canvas)           │     ║
║  │   · Hexbin (H3)      │    │   · User location marker           │     ║
║  │   · User marker      │    └────────────────────────────────────┘     ║
║  └──────────────────────┘                                                ║
║                                                                          ║
║  SidebarPanel   → Katman/şiddet/zaman filtresi                          ║
║  AlertPanel     → Yakın tehdit listesi (mesafeye göre, max 20)          ║
║  StatsOverlay   → Canlı olay sayacı                                     ║
║  SettingsPanel  → Tema, erişilebilirlik, dil                            ║
║  EmergencyPopup → Kritik/yüksek tehdit yakına gelince otomatik açılır   ║
║  LoadingScreen  → IDB cache hazır olunca kapanır                        ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Katman 1 — Veri Toplayıcı

### Kaynak Başlatma

```
Node.js Aggregator
│
├── EMSC WebSocket        → connectEMSC()     → handleEvent()
├── USGS REST (60s)       → startUSGS()       → handleEvent()
├── AFAD REST (60s)       → startAFAD()       → handleEvent()
├── Kandilli REST (60s)   → startKandilli()   → handleEvent()
├── GEOFON REST (60s)     → startGEOFON()     → handleEvent()
├── GDACS REST (5dk)      → startGDACS()      → handleEvent()
├── PTWC REST (5dk)       → startPTWC()       → handleEvent()
├── PTWC RSS              → startPTWCRSS()    → handleEvent()
├── GDACS RSS             → startGDACSRSS()   → handleEvent()
├── NASA FIRMS (15dk)     → startNASAFirms()  → handleEvent()  [KEY gerekli]
├── FEWSNET REST (1s)     → startFEWSNET()    → handleEvent()
├── WHO REST (1s)         → startWHO()        → handleEvent()
└── IoT Custom            → startIoTSource()  → handleEvent()  [opsiyonel]
```

### handleEvent() Akışı

```
handleEvent(event)
  │
  ├─ deduplicator.isDuplicate(event)?
  │   ├─ EVET → drop (log yok)
  │   └─ HAYIR ↓
  │
  ├─ deduplicator.add(event)
  │
  ├─ queueWrite(event) → writeQueue[] → her 2s'de flushQueue()
  │                         └─ supabase.from(table).upsert(rows, {onConflict:'id'})
  │
  └─ event.type === 'earthquake' && magnitude >= 4.0?
      └─ calculateEarlyWarning(event)
          └─ affectedCities.length > 0?
              └─ writeEarlyWarning(warning) → early_warnings tablosu
```

### Deduplication Eşikleri

| Afet Tipi | Mesafe | Zaman Penceresi |
|---|---|---|
| Deprem | 20 km | 5 dakika |
| Yangın | 5 km | 5 dakika |
| Sel | 20 km | 5 dakika |
| Kuraklık | 20 km | 5 dakika |
| Gıda Güvensizliği | 50 km | 5 dakika |

### Şiddet Haritalaması

| Büyüklük | Şiddet |
|---|---|
| ≥ 7.0 | critical 🔴 |
| ≥ 5.5 | high 🟠 |
| ≥ 4.0 | moderate 🟡 |
| ≥ 2.5 | low 🟢 |
| < 2.5 | minimal ⚪ |

---

## 4. Katman 2 — Veritabanı

### Tablo Yapısı (tüm afet tabloları aynı şemayı paylaşır)

```sql
CREATE TABLE earthquake (
  id          TEXT PRIMARY KEY,
  type        TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  severity    TEXT,
  magnitude   DOUBLE PRECISION,
  depth       DOUBLE PRECISION,
  title       TEXT,
  description TEXT,
  time        TIMESTAMPTZ,
  source      TEXT,
  source_url  TEXT,
  extra       JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Veri Akışı (DB içinde)

```
Aggregator UPSERT
  → earthquake (ham veri, koordinat filtresi YOK)
       ↓
  earthquake_view (lat -90~90, lng -180~180 kontrolü, time DESC)
       ↓
  Frontend SELECT + Realtime INSERT broadcast
```

### Tablolar ve Realtime

| Tablo | View | Realtime |
|---|---|---|
| earthquake | earthquake_view | ✅ INSERT |
| wildfire | wildfire_view | ✅ INSERT |
| flood | flood_view | ✅ INSERT |
| drought | drought_view | ✅ INSERT |
| food_security | food_security_view | ✅ INSERT |
| tsunami | tsunami_view | ✅ INSERT |
| cyclone | cyclone_view | ✅ INSERT |
| volcano | volcano_view | ✅ INSERT |
| epidemic | epidemic_view | ✅ INSERT |
| early_warnings | early_warnings_view | ✅ INSERT |

---

## 5. Katman 3 — Frontend

### Başlatma Sırası

```
App.vue onMounted()
  └─ disasterStore.startWebSocket()
       ├─ 1. loadFromCache()        → IndexedDB'den anında yükle
       │      isLoading = false     → LoadingScreen kapanır
       │
       ├─ 2. loadFromSupabase()     → Supabase view'lardan delta fetch
       │      Son IDB fetch'ten bu yana geçen süre kadar çek
       │      Uzun aralık (>30 gün) → otomatik magnitude filtresi
       │      IndexedDB'ye yaz
       │
       └─ 3. startRealtime()        → subscribeRealtime()
              9 tabloya Realtime INSERT subscription
              Gelen event → addEvent() → store'a ekle + IDB'ye yaz
```

### Pinia Store Yapısı

```
disasterStore
  State:   earthquakes[], wildfires[], floods[], droughts[],
           foodSecurity[], tsunamis[], cyclones[], volcanoes[], epidemics[]
           activeLayers (Set), activeSeverities (Set)
           startDate, endDate, selectedTimeRange (saat)
           minMagnitude, maxDepth
           earlyWarnings[], activeWarning
  Getters: allEvents (filtreli), totalCount, criticalEvents
  Actions: addEvent, loadBatch, loadFromSupabase, startRealtime

geolocationStore
  State:   userLat, userLng, alertRadius (km), nearbyThreats[]
  Actions: requestLocation, calculateNearbyThreats, setAlertRadius

uiStore
  State:   viewMode (globe/map), sidebarOpen, alertPanelOpen,
           emergencyPopupOpen, activeEmergency
           darkMode, highContrast, safeMode, colorblindMode
```

### Emergency Alert Zinciri

```
Supabase Realtime → addEvent(event)
                          │
HomeView watcher: [allEvents, userLat] değişti
  → geoStore.calculateNearbyThreats(allEvents)
       → nearbyThreats = allEvents
           .filter(distance <= alertRadius)
           .sort(ascending distance)
           .slice(0, 20)
                          │
HomeView watcher: nearbyThreats değişti
  → criticalThreat = threats.find(severity critical|high)?
       → uiStore.activeEmergency = criticalThreat
       → uiStore.emergencyPopupOpen = true
       → EmergencyPopup açılır (pulse animasyonu)
```

---

## 6. Canlı Veri Akışı

İki ayrı yol — farklı öncelikler:

### Yol A — Erken Uyarı (P-Wave Alarmı) → ~300–500ms

```
t=0ms      M4.0+ deprem algılandı (EMSC WS veya USGS/AFAD poll)
t=0ms      calculateEarlyWarning() → S-dalgası varış süreleri hesaplandı
t=0ms      writeEarlyWarning() → DOĞRUDAN await insert() [kuyruk YOK]
t=100ms    Supabase: row commit
t=200ms    Supabase Realtime: early_warnings INSERT broadcast
t=300-500ms Frontend: EmergencyPopup açıldı (saniye bazlı geri sayım)
```

### Yol B — Harita Verisi (Tüm Olaylar) → ~2300ms

```
t=0ms    Herhangi bir afet olayı kaynaktan geldi
t=0ms    normalize → dedup → queueWrite() [2 sn buffer]
t=2000ms flushQueue() → supabase.from('earthquake').upsert([...])
t=2100ms Supabase Realtime: INSERT broadcast
t=2200ms Frontend: rowToEvent() → disasterStore.addEvent()
t=2300ms GlobeView / MapView: yeni nokta render edildi
```

> 2300ms sadece harita gösterimi içindir — kabul edilebilir.  
> Gerçek alarm yolu (Yol A) ~300–500ms'de kullanıcıya ulaşır.

---

## 7. Veri Kaynakları

| Kaynak | Afet Tipi | Protokol | Güncelleme |
|---|---|---|---|
| EMSC | Deprem | WebSocket | Gerçek zamanlı |
| USGS | Deprem | REST GeoJSON | 60 saniye |
| AFAD | Deprem | REST | 60 saniye |
| Kandilli | Deprem | REST | 60 saniye |
| GEOFON | Deprem | REST | 60 saniye |
| GDACS | Çoklu afet | REST + RSS | 5 dakika |
| PTWC | Tsunami | REST + RSS | 5 dakika |
| NASA FIRMS | Orman yangını | REST | 15 dakika |
| WHO | Salgın | REST | 1 saat |
| FEWSNET | Gıda güvensizliği | REST | 1 saat |
| ReliefWeb | Sel / Genel | REST | 5 dakika |
| GloFAS/Copernicus | Sel | REST | 5 dakika |

---

## 8. Deploy Mimarisi

### MVP (Şu An)

```
┌─────────────────────────────────────┐
│  Sunucu / Lokal Makine              │
│                                     │
│  docker compose --profile cloud up  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  mhews-aggregator           │    │
│  │  Node.js 22 · Port 8765     │    │
│  │  restart: unless-stopped    │    │
│  └──────────────┬──────────────┘    │
└─────────────────┼───────────────────┘
                  │ HTTPS (service_role)
                  ▼
         Supabase Cloud (PostgreSQL)
                  │
                  │ REST + Realtime
                  ▼
         Frontend (Vite dev / Vercel)
```

### Ortam Değişkenleri

| Dosya | Değişken | Kullanım |
|---|---|---|
| `server/.env` | `SUPABASE_URL` | Aggregator → DB bağlantısı |
| `server/.env` | `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass (yazma) |
| `server/.env` | `NASA_FIRMS_KEY` | NASA yangın API |
| `.env` | `VITE_SUPABASE_URL` | Frontend → Supabase |
| `.env` | `VITE_SUPABASE_ANON_KEY` | Frontend okuma |

### Self-Hosted (Opsiyonel)

```
docker compose --profile self-hosted up

Servisler:
  mhews-aggregator   → Node.js data toplayıcı
  mhews-db           → Supabase/PostgreSQL 15
  mhews-realtime     → Supabase Realtime v2
  mhews-kong         → API Gateway
  mhews-frontend     → Nginx (statik Vue build)
```

---

## 9. Ürün Fazı — Auth & Çok Kiracılı Yapı

### Planlanan Kullanıcı Modeli

```
GEWS Platform
│
├── Bakanlık A (Türkiye AFAD)
│    ├── Kullanıcı: Yönetici
│    ├── Kullanıcı: Analist
│    └── Kullanıcı: Saha koordinatörü
│
├── Bakanlık B (Yunan Sivil Korunma)
│    └── Kullanıcı: Analist
│
└── BM / Uluslararası kuruluş
     └── Kullanıcı: Gözlemci
```

### Auth Ekleme Planı

Supabase Auth — mevcut mimariye **sıfır değişiklikle** eklenir:

```
Aggregator  →  DB  →  Frontend
                           ↓
                    Supabase Auth
                    (email/şifre veya SSO/SAML)
                           ↓
                    auth.uid() ile RLS güncellenir
```

**RLS Geçiş (tek değişiklik):**

```sql
-- MVP (herkese açık)
CREATE POLICY "public_read" ON earthquake
  FOR SELECT USING (true);

-- Ürün fazı (sadece giriş yapmış kullanıcılar)
CREATE POLICY "auth_read" ON earthquake
  FOR SELECT USING (auth.role() = 'authenticated');
```

### SSO Entegrasyonu (Devlet LDAP/AD)

Supabase Auth, SAML 2.0 SSO'yu destekler. Bakanlıkların Active Directory altyapısıyla doğrudan entegre çalışır. Kullanıcılar kurumsal kimlik bilgileriyle giriş yapar.

---

## 10. Güvenlik & RLS

### Mevcut Durum

```
Yazma:  Yalnızca SUPABASE_SERVICE_ROLE_KEY (aggregator)
Okuma:  Herkes (anon key ile)
RLS:    Tüm tablolarda aktif, public_read policy
```

### Ürün Fazında Planlanan

```
Yazma:  Yalnızca service_role (aggregator, değişmez)
Okuma:  Yalnızca authenticated kullanıcılar
Audit:  Supabase Log Explorer ile erişim takibi
Bölge:  Kurum bazlı veri erişimi (RLS + JWT claim)
```

---

## Özet Tablo

| Katman | Teknoloji | Durum |
|---|---|---|
| Veri Toplama | Node.js 22, Docker | ✅ Aktif |
| Veritabanı | Supabase PostgreSQL | ✅ Aktif |
| Realtime | Supabase Realtime | ✅ Aktif |
| Frontend | Vue 3, Vite, Pinia | ✅ Aktif |
| 3D Görsel | globe.gl (Three.js) | ✅ Aktif |
| 2D Harita | Leaflet + H3 Hexbin | ✅ Aktif |
| Offline Cache | IndexedDB + localStorage | ✅ Aktif |
| Çok Dil | vue-i18n (7 dil) | ✅ Aktif |
| Mobil | Quasar + Cordova (iOS/Android) | 🔜 Build aşaması |
| Auth | Supabase Auth | 🔜 Ürün fazı |
| Push Bildirim | FCM / APNS | 🔜 Ürün fazı |
