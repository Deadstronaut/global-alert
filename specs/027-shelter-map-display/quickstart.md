# Quickstart: Sığınakların Harita Üzerinde Gösterimi

Bu spec migration/Edge Function İÇERMEZ — doğrulama tamamen frontend'de, dev server üzerinde yapılır. Ön koşul: en az bir aktif (`is_active=true`), koordinatlı (`lat`/`lng` dolu) sığınak kaydının veritabanında bulunması (spec 021'in `/shelters` sayfasından veya AdminView'dan eklenmiş olabilir).

## Ön koşullar

- `npm run dev` ile dev server çalışıyor
- En az bir kullanıcı hesabıyla giriş yapılmış (herhangi bir rol — Viewer dahil)
- Veritabanında en az bir `shelters` satırı: `is_active=true`, `lat`/`lng` dolu

## Senaryo 1: Sığınak marker'ı haritada görünüyor (US1, FR-001, FR-002, SC-001)

1. Ana harita görünümüne git (globe/harita geçişini yap).
2. Beklenen: aktif+koordinatlı sığınak(lar) için haritada ayırt edici bir işaretçi görünür (3 saniye içinde, SC-001).
3. Pasif veya koordinatsız bir sığınak varsa: o sığınak için işaretçi GÖRÜNMEMELİ (FR-002).

## Senaryo 2: Popup içeriği doğru (US1, FR-003, FR-004, FR-007)

1. Bir sığınak işaretçisine tıkla.
2. Beklenen: popup'ta sığınağın adı, doluluk ("X/Y, %Z"), durumu (açık/dolu/kapalı) görünür.
3. `status='open'` → yeşil renk, `status='full'` → turuncu, `status='closed'` → gri (FR-004).
4. `linked_incident_id` dolu bir sığınak için: popup'ta "İlgili bir olaya bağlı" (veya benzeri) göstergesi görünür (FR-007).

## Senaryo 3: Zoom-bağımsız görünürlük (FR-005)

1. Haritayı hexbin veya heatmap moduna al (`uiStore.mapMode`), zoom'u 8'in altına indir.
2. Beklenen: disaster-event marker'ları bu zoom'da gizlenir (mevcut davranış) AMA sığınak marker'ları görünür kalmaya devam eder.

## Senaryo 4: Katman toggle (US2, FR-006, SC-004)

1. Harita üzerindeki "Sığınakları Gizle" kontrolüne tıkla.
2. Beklenen: tüm sığınak işaretçileri anında (1 saniyeden az) haritadan kaybolur.
3. "Sığınakları Göster" kontrolüne tekrar tıkla.
4. Beklenen: aktif+koordinatlı sığınakların işaretçileri tekrar görünür.

## Senaryo 5: Erişim kontrolü yok (FR-008, SC-003)

1. Bir Viewer rolündeki kullanıcı hesabıyla giriş yap.
2. Beklenen: ana harita görünümü ve sığınak katmanı, diğer rollerle aynı şekilde görünür — ek bir yetkilendirme hatası/engelleme olmamalı (mevcut `authenticated_shelters_read` RLS'i zaten bunu garanti ediyor).

## Birim test doğrulaması

```sh
npm run test -- shelterMarkerStyle
```

Beklenen: `getShelterMarkerColor('open')`/`'full'`/`'closed'`/bilinmeyen-durum için doğru renkleri döndürdüğünü doğrulayan testler PASS.

## Build doğrulaması

```sh
npm run build
```

Beklenen: temiz build, hiçbir yeni TypeScript/ESLint hatası yok.
