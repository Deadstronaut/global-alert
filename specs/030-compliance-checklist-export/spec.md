# Feature Specification: Uyumluluk Kontrol Listesi Export'u ve Şablon Versiyonlama

**Feature Branch**: `030-compliance-checklist-export`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Audit & Compliance modülünde PRD'de açıkça yer alan ama daha önce hiç yapılmamış iki MEDIUM/S1-S2 gereksinim: (1) MHEWS-FR-0067 — Export structured checklist compliance evidence. (2) MHEWS-FR-0071 — Version-control compliance export templates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bir Super Admin, haftalık uyumluluk raporunu madde-madde kontrol listesi olarak dışa aktarır (Priority: P1) 🎯 MVP

Bir Super Admin, denetim ekibine veya bir dış denetçiye sunmak üzere, mevcut haftalık uyumluluk raporunun sadece ham veri tablosu yerine, PRD'nin kendi tanımladığı kontrol kriterlerine (ör. "haftalık rapor zamanında üretildi mi", "hash-zinciri bütünlüğü doğrulandı mı", "denetim yazma hatası oluştu mu") karşılık gelen, her biri açıkça karşılandı/karşılanmadı durumu taşıyan yapılandırılmış bir kontrol listesi (checklist) olarak dışa aktarabilir.

**Why this priority**: PRD'nin CRITICAL olmayan ama açıkça yazılı bir S1-S2 gereksinimi (MHEWS-FR-0067) — bir denetçiye "sistem uyumlu mu" sorusunun cevabını tek tek maddeler halinde, ham veriyi yorumlamaya gerek kalmadan verir. Tek başına değer sağlar.

**Independent Test**: Mevcut bir `compliance_reports` kaydı seçilir, "Kontrol Listesi Olarak Dışa Aktar" aksiyonu tetiklenir; çıktının her PRD kriterini ayrı bir madde olarak, karşılandı/karşılanmadı durumuyla birlikte içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** en az bir `compliance_reports` kaydı mevcutken, **When** bir Super Admin o kayıt için "Kontrol Listesi Export" aksiyonunu tetikler, **Then** sistem her kontrol kriterini (rapor zamanında üretildi mi / hash-zinciri bütünlüğü doğrulandı mı / o dönemde denetim yazma hatası oluştu mu / o dönemde eksik-bilgili denetim kaydı reddedildi mi) ayrı bir madde olarak, karşılandı veya karşılanmadı durumuyla listeler.
2. **Given** bir kontrol kriterinin karşılanmadığı bir dönem (ör. hash-zinciri doğrulaması o hafta başarısız olmuş), **When** kontrol listesi dışa aktarılır, **Then** ilgili madde açıkça "karşılanmadı" olarak işaretlenir, sessizce atlanmaz.
3. **Given** kontrol listesi dışa aktarılırken, **When** çıktı üretilir, **Then** her madde, durumunu destekleyen ilgili ham veri noktasına (ör. hangi rapor kaydı, hangi tarih) referans verir.

---

### User Story 2 - Bir export'un hangi şablon sürümüyle üretildiği her zaman belli olur (Priority: P2)

Bir Super Admin veya dış denetçi, geçmişte üretilmiş bir uyumluluk export'unu (kontrol listesi veya mevcut CSV/JSON export) incelediğinde, bu export'un hangi rapor şablonu sürümüyle üretildiğini görebilir — böylece zaman içinde şablon değiştiğinde (yeni kriter eklendiğinde/kriterin ifadesi değiştiğinde) hangi export'un hangi kurallara göre üretildiği izlenebilir.

**Why this priority**: PRD'nin bir diğer açık S1-S2 gereksinimi (MHEWS-FR-0071) — ama User Story 1'in aksine bağımsız bir özellik değil, User Story 1'in çıktısını zenginleştiren bir meta-bilgi katmanı. Bu yüzden P2.

**Independent Test**: Herhangi bir export (kontrol listesi veya mevcut CSV/JSON) üretilir; çıktının açıkça bir şablon sürüm numarası (ör. "v1") içerdiği doğrulanır.

**Acceptance Scenarios**:

1. **Given** kontrol listesi veya mevcut CSV/JSON export mekanizması, **When** bir export üretilir, **Then** çıktı, üretildiği andaki şablon sürüm numarasını açıkça içerir.
2. **Given** gelecekte şablonun kriterleri değiştirilirse (bu spec'in kapsamı dışında, ileride), **When** yeni şablon sürümüyle bir export üretilir, **Then** sürüm numarası artırılmış olarak görünür — böylece eski export'lar hangi kurallara göre üretildiğiyle birlikte anlaşılabilir kalır.

---

### Edge Cases

- Henüz hiç `compliance_reports` kaydı yoksa (yeni kurulmuş bir ortam): kontrol listesi export aksiyonu "henüz rapor yok" mesajı gösterir, hata vermez.
- Bir kontrol kriteri, mevcut `compliance_reports` verisinden hesaplanamıyorsa (ör. veri eksikse): madde "belirlenemedi" durumuyla işaretlenir, sessizce atlanmaz veya yanlış "karşılandı" göstermez.
- Şablon sürüm numarası, mevcut export mekanizmalarının (CSV/JSON) geriye dönük davranışını bozmaz — sadece ek bir alan/sütun olarak eklenir.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistem, bir Super Admin'in mevcut bir `compliance_reports` kaydını, PRD'nin tanımladığı kontrol kriterlerine karşılık gelen yapılandırılmış bir kontrol listesi (checklist) formatında dışa aktarmasına İZİN VERMELİDİR.
- **FR-002**: Kontrol listesindeki her madde, en az şu bilgileri taşımalıDIR: kriter açıklaması, karşılandı/karşılanmadı/belirlenemedi durumu, ilgili ham veri referansı.
- **FR-003**: Kontrol listesi en az şu kriterleri kapsamalıDIR: (a) rapor dönemin zamanında üretilip üretilmediği, (b) o dönemin hash-zinciri bütünlüğünün doğrulanıp doğrulanmadığı, (c) o dönemde bekleyen (dead-letter) bir denetim yazma hatası kalıp kalmadığı, (d) o dönemde tamlık kuralını ihlal eden bir denetim kaydı girişimi olup olmadığı.
- **FR-004**: Sistem, kontrol listesi dahil TÜM uyumluluk export'larına (mevcut CSV/JSON dahil) üretildiği andaki şablon sürüm numarasını eklemelidir.
- **FR-005**: Kontrol listesi export'u, mevcut denetim erişim kısıtlamasıyla (sadece Super Admin) aynı yetkilendirmeye tabi olmalıDIR.
- **FR-006**: Mevcut CSV/JSON export'ların ve `compliance_reports`/`audit_log` şemasının davranışı bu spec ile değişmemeliDIR (sadece additive: yeni bir export formatı + her export'a eklenen bir sürüm alanı).

### Key Entities

- **Uyumluluk Kontrol Listesi (Compliance Checklist)**: Mevcut bir `compliance_reports` kaydından türetilen, PRD kriterlerine karşılık gelen maddelerden oluşan, salt-okunur bir görünüm/export — yeni bir kalıcı veritabanı varlığı değildir.
- **Şablon Sürümü (Template Version)**: Export çıktısına gömülen, hangi kural setiyle üretildiğini belirten bir sabit sürüm göstergesi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bir Super Admin, mevcut herhangi bir uyumluluk raporunu tek bir aksiyonla kontrol listesi formatında dışa aktarabilir ve sonucu anında görebilir.
- **SC-002**: Dışa aktarılan kontrol listesindeki maddelerin %100'ü, karşılandı/karşılanmadı/belirlenemedi durumlarından birini açıkça taşır — hiçbiri belirsiz veya boş bırakılmaz.
- **SC-003**: Üretilen her export (kontrol listesi veya mevcut CSV/JSON), hangi şablon sürümüyle üretildiğini %100 oranında açıkça gösterir.

## Assumptions

- "Yapılandırılmış kontrol listesi" formatı, mevcut export altyapısının (CSV/JSON, `rowsToCsv`/`rowsToJson`/`triggerDownload`) üzerine inşa edilir — PDF gibi yeni bir dosya formatı gerektirmez (Constitution Principle VIII/YAGNI ile tutarlı, PDF/S3 evidence packages zaten önceki spec 029'da kapsam dışı bırakılmıştı).
- Şablon versiyonlama, tam bir versiyon-geçmişi/migration sistemi değil, sabit bir `TEMPLATE_VERSION` sabitinin export çıktısına gömülmesi olarak yorumlanır — YAGNI, çünkü şu ana kadar şablonun kendisi hiç değişmemiştir ve gelecekte değişirse sabit güncellenip artırılabilir.
- Kontrol listesi kriterleri, mevcut `compliance_reports` tablosunun zaten tuttuğu verilerden (hash-zinciri doğrulama sonucu, rapor dönemi) ve spec 029'un yeni eklediği `audit_log_dead_letter`/`chk_audit_log_completeness` mekanizmalarından türetilir — yeni bir veri toplama mekanizması gerekmez.
- Bu spec, `compliance_reports`/`audit_log` şemasında hiçbir değişiklik gerektirmeyebilir — sadece yeni bir frontend/export-fonksiyonu katmanı (plan aşamasında netleştirilecek).
- Mevcut export'ların (CSV/JSON) hiçbir otomatik dış tüketicisi yok — sadece bir Super Admin tarafından manuel olarak indiriliyor. Bu yüzden export çıktısına yeni bir `template_version` alanı eklemek (FR-004) additive/güvenli bir değişiklik sayılır, mevcut satır şeklini/kolonlarını bozmaz ve FR-006'nın "davranış değişmemeli" gereksinimini ihlal etmez (analiz bulgusu F1).
