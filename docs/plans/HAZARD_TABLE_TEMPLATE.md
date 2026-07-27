# Yeni Hazard Type İçin Özel (Dedicated) Tablo Şablonu

**Ne zaman kullanılır:** Yeni bir hazard type (örn. `landslide`) varsayılan olarak genel `disaster` kova tablosuna düşer (bkz. `20260727000000_hazard_types_icon_color_and_generic_fk.sql`) — admin panelden Hazard Taksonomisi'ne eklemek ve "Kaynak Ekle"den bir kaynak bağlamak yeterli, hiçbir migration/kod değişikliği gerekmez. Bu şablon SADECE bir hazard type'ın hacmi/önemi arttığında, onu genel kovadan ayırıp **kendi özel tablosuna** "yükseltmek" isteyen bir geliştirici/sistem admini için.

**Bu otomatik değildir.** Uygulama hiçbir zaman kendi başına `CREATE TABLE` çalıştırmaz (bilinçli mimari karar — SQL-injection yüzeyi ve federe kurulumlar arası şema sapması riski). Bu doküman, elle yapacaksanız sistemin geri kalanıyla uyumlu, tutarlı bir sonuç almanız için bir kalıp sağlar.

## Adım 1 — Tabloyu, RLS'i, view'ı yarat

Aşağıdaki SQL'i bir migration dosyasına kopyalayın, `{{table_name}}` yer tutucusunu gerçek tablo adıyla (örn. `landslide`) değiştirin, çalıştırın. Bu, mevcut 9 hazard tablosuyla (`earthquake`, `flood`, vb.) BİREBİR aynı şema/RLS/view desenidir.

```sql
CREATE TABLE {{table_name}} (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  severity      TEXT,
  magnitude     DOUBLE PRECISION,   -- ilgisizse bırakılabilir, NULL kalır
  depth         DOUBLE PRECISION,   -- sadece earthquake benzeri tipler için, aksi halde kolonu hiç ekleme
  title         TEXT,
  description   TEXT,
  time          TIMESTAMPTZ,
  source        TEXT,
  source_url    TEXT,
  country_code  VARCHAR(2),
  extra         JSONB,
  received_at   TIMESTAMPTZ DEFAULT now(),
  h3_id         TEXT
);

ALTER TABLE {{table_name}} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_{{table_name}}" ON {{table_name}}
  FOR SELECT TO anon USING (true);

CREATE POLICY "country_scoped_read_{{table_name}}" ON {{table_name}}
  FOR SELECT TO authenticated USING (
    current_profile_role() = 'super_admin'
    OR country_code IS NULL
    OR country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX idx_{{table_name}}_country ON {{table_name}} (country_code, time DESC);

CREATE VIEW {{table_name}}_view AS
SELECT id, type, lat, lng, severity, magnitude, title, description, time,
       source, source_url, extra, received_at, h3_id, country_code
FROM {{table_name}}
WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
ORDER BY time DESC;
```

**Not:** Hiçbir INSERT/UPDATE/DELETE RLS politikası eklenmedi — mevcut 9 tabloyla aynı desen, yazmalar `service_role` üzerinden yapılıyor (RLS'i bypass ediyor), anon/authenticated kullanıcı doğrudan yazamaz.

## Adım 2 — Kod tarafında 3 dosyaya satır ekleyin

Tablo yaratıldıktan sonra, üç dosyaya elle satır eklenmesi gerekir (bunlar bilerek otomatikleştirilmedi):

**1. `server/src/output/supabaseWriter.js`** — `TABLE_MAP` objesine:
```js
{{hazard_type}}: '{{table_name}}',
```

**2. `src/services/supabaseService.js`** — üç objeye:
```js
// TABLE_MAP'e
{{table_name}}_view: '{{table_name}}',
// REALTIME_TABLE_MAP'e
{{table_name}}: '{{table_name}}',
// FETCH_LIMIT'e
{{table_name}}_view: 10000,
```

**3. `src/stores/disaster.js`** — yeni bir `ref([])`, `storeMap`'e giriş, `activeLayers` Set'ine giriş, `MAX_EVENTS`'e giriş:
```js
const {{yeniRef}} = ref([]);
// storeMap içine:
{{hazard_type}}: {{yeniRef}},
// activeLayers Set'ine:
'{{hazard_type}}',
// MAX_EVENTS'e:
{{hazard_type}}: 10000,
```

## İkon/renk için ekstra iş yok

`hazard_types.icon`/`.color` zaten dinamik okunuyor (`MapView.vue`'nin `hazardIconForMap()`/`hazardDisplayNameForMap()` fonksiyonları) — tablo özel olsun ya da genel `disaster` kovasında kalsın, ikon/etiket aynı mekanizmadan geliyor, bu adımda değişiklik gerekmiyor.

## İlgili doküman

Bu şablon, self-hosted federasyon kurulumları için `docs/FEDERATION_SETUP_PLAN.md`'nin bir parçasıdır — "kendi tablomu yaratmak istiyorum" diyen bir ülke sistem admini buraya yönlendirilir.
