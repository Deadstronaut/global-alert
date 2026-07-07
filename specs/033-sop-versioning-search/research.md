# Research: SOP Repository Sürümleme, Kategori ve Arama

## Decision 1: Kategori — serbest metin alan, kontrollü liste değil

**Decision**: `sop_documents.category TEXT` (nullable). Panelde: mevcut SOP'lardan türetilen benzersiz kategori listesi bir `<datalist>`/dropdown olarak sunulur, ama kullanıcı yeni bir kategori de yazabilir (serbest metin input + datalist önerisi).

**Rationale**: PRD'nin örneği ("Legislation, SOPs, etc.") kapalı bir enum değil, açık uçlu bir sınıflandırma öneriyor. Yeni bir `sop_categories` registry tablosu (hazard_types gibi) kurmak bu ölçek için aşırı mühendislik olurdu (YAGNI) — serbest metin + var olanlardan öneri yeterli.

**Alternatives considered**: `hazard_types` benzeri ayrı bir `sop_categories` tablosu — reddedildi, kategori sayısı muhtemelen çok az (birkaç tane) ve admin tarafından ad-hoc genişletilebilir olmalı, ayrı bir CRUD ekranı gerektirmemeli.

## Decision 2: Arama — client-side, full-text search altyapısı YOK

**Decision**: Yeni bir saf fonksiyon `filterSopDocuments(sopDocuments, { category, searchTerm })` (`src/services/sopFilter.js`) — mevcut yüklenmiş `sopDocuments` dizisini `category` (tam eşleşme, boşsa hepsi) ve `searchTerm` (title'da case-insensitive, kısmi eşleşme) ile filtreler.

**Rationale**: SOP listesi doğası gereği küçük ölçekli (bir ülke/organizasyon için onlarca, yüzlerce değil) — Postgres `pg_trgm`/full-text search extension'ı eklemek bu ölçekte gereksiz karmaşıklık (YAGNI). Mevcut proje zaten benzer client-side filtreleme desenlerini kullanıyor (ör. `groupSourcesByScope`).

**Alternatives considered**: Sunucu tarafı (Supabase `ilike` sorgusu) arama — reddedildi, veri zaten tamamen client'a yükleniyor (`fetchSopDocuments()` tüm satırları çekiyor), ekstra bir network round-trip'i gereksiz.

## Decision 3: Sürüm geçmişi — append-only history tablosu + BEFORE UPDATE trigger

**Decision**: Yeni `sop_document_versions` tablosu (`id, sop_document_id, version, title, body_content, reference_url, archived_at`). `sop_documents`'a `version INTEGER NOT NULL DEFAULT 1` eklenir. Yeni bir `BEFORE UPDATE` trigger fonksiyonu `archive_sop_document_version()`: `OLD.title IS DISTINCT FROM NEW.title OR OLD.body_content IS DISTINCT FROM NEW.body_content OR OLD.reference_url IS DISTINCT FROM NEW.reference_url` ise `OLD`'u `sop_document_versions`'a kopyalar ve `NEW.version = OLD.version + 1` yapar; sadece `is_active` değiştiyse hiçbir şey yapmaz (FR-006).

**Rationale**: PRD'nin "previous version is preserved" gereksinimi tam olarak bu — eski satırın bir kopyasını saklamak. `BEFORE UPDATE` trigger'ı `NEW.version`'ı da aynı işlemde güncelleyebildiği için ayrı bir uygulama-katmanı mantığına gerek kalmıyor (veritabanı seviyesinde garanti, `guard_dispatch_transition()`/`guard_cap_draft_transition()` gibi mevcut trigger-based state machine desenleriyle tutarlı bir yaklaşım).

**Alternatives considered**: Uygulama katmanında (Vue store'da) versiyonlamayı yönetmek (güncelleme öncesi eski satırı okuyup ayrı bir INSERT yapmak) — reddedildi, race condition riski taşır (iki eşzamanlı güncelleme) ve DB-seviyesinde garanti edilmiyor; trigger yaklaşımı atomik ve güvenilir.

## Decision 4: `sop_document_versions` RLS ve yazma yetkisi

**Decision**: `sop_document_versions` RLS: `sop_documents` ile aynı SELECT erişimi (super_admin VEYA `sop_repository` capability grant'ine sahip VEYA `is_active` bir SOP'un versiyonu okunabilir — pratikte SELECT policy `sop_documents`'a JOIN ile aynı yetkilendirmeyi mirror eder). Hiçbir role INSERT/UPDATE/DELETE policy'si YOK — trigger fonksiyonu `SECURITY DEFINER` olarak tanımlanır, böylece RLS'i bypass ederek yazabilir (mevcut `log_table_change()` deseniyle aynı yaklaşım).

**Rationale**: Kullanıcı asla doğrudan bu tabloya yazmamalı — sadece güncelleme trigger'ı üzerinden, otomatik olarak doldurulmalı. `SECURITY DEFINER` trigger fonksiyonu, projenin zaten `log_table_change()`'de kullandığı kanıtlanmış bir desen.

**Alternatives considered**: `sop_document_versions`'a `super_admin_all` policy'si vermek (RLS bypass yerine) — reddedildi, gereksiz bir yazma yolu açardı (bir super_admin'in geçmiş kayıtları manuel düzenleyebilmesi FR-008'in "append-only" ilkesini zayıflatırdı).

## Decision 5: Test coverage

**Decision**: `filterSopDocuments()` Vitest ile mock'suz test edilir (`tests/unit/sopFilter.test.js`, mevcut convention). Trigger'ın DB-seviyesi davranışı (sürüm oluşturma/oluşturmama) canlıda transactional test ile doğrulanır (proje convention'ı, migration uygulandıktan sonra).

**Rationale**: Saf filtreleme mantığı frontend'de yaşıyor, mevcut proje convention'ıyla tutarlı test edilir; trigger mantığı SQL olduğu için canlı doğrulama (spec 028/029/030'da olduğu gibi) yeterli.
