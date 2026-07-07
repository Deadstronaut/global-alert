# Data Model: SOP Repository Sürümleme, Kategori ve Arama

## Değişen Entity: `sop_documents`

Kaynak: `supabase/migrations/20260707140100_sop_documents.sql`. Yeni kolonlar:

```sql
ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE sop_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
```

- `category`: serbest metin, nullable (research.md Decision 1).
- `version`: her içerik-etkileyen güncellemede trigger tarafından artırılır (research.md Decision 3).
- Mevcut RLS (`super_admin_sop_documents_all`, `capability_granted_sop_repository_all`, `read_active_sop_documents`), hazard-tipi eşleştirmesi, audit trigger'ı hiç değişmez.

## Yeni Entity: `sop_document_versions`

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `sop_document_id` | UUID | `sop_documents(id) ON DELETE CASCADE` |
| `version` | INTEGER | Arşivlenen sürüm numarası (eski `OLD.version`) |
| `title` | TEXT | Arşivlenen başlık |
| `body_content` | TEXT | Arşivlenen içerik |
| `reference_url` | TEXT | Arşivlenen referans linki |
| `archived_at` | TIMESTAMPTZ | `DEFAULT NOW()` |

RLS: SELECT — `sop_documents` ile aynı yetkilendirme (super_admin VEYA `current_profile_has_capability('sop_repository')` VEYA ilgili SOP `is_active`). INSERT/UPDATE/DELETE policy YOK — sadece `archive_sop_document_version()` trigger fonksiyonu (`SECURITY DEFINER`) yazar (research.md Decision 4).

## Yeni Trigger Fonksiyonu: `archive_sop_document_version()`

```sql
CREATE OR REPLACE FUNCTION archive_sop_document_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.body_content IS DISTINCT FROM NEW.body_content
     OR OLD.reference_url IS DISTINCT FROM NEW.reference_url THEN
    INSERT INTO sop_document_versions (sop_document_id, version, title, body_content, reference_url)
    VALUES (OLD.id, OLD.version, OLD.title, OLD.body_content, OLD.reference_url);
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sop_documents_archive_version ON sop_documents;
CREATE TRIGGER sop_documents_archive_version
  BEFORE UPDATE ON sop_documents
  FOR EACH ROW EXECUTE FUNCTION archive_sop_document_version();
```

- Sadece `title`/`body_content`/`reference_url` değiştiğinde tetiklenir — sadece `is_active` değişen güncellemeler (FR-006) yeni bir sürüm oluşturmaz.
- `BEFORE UPDATE` olduğu için `NEW.version`'ı aynı işlemde güncelleyebilir (ayrı bir UPDATE gerekmez).

## Yeni saf fonksiyon (Frontend, `src/services/sopFilter.js`)

```js
function filterSopDocuments(sopDocuments, { category, searchTerm }) {
  return sopDocuments.filter((s) => {
    const matchesCategory = !category || s.category === category;
    const matchesSearch = !searchTerm || s.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}
```

## Frontend Değişikliği: `src/stores/sopDocuments.js`

Yeni `fetchSopDocumentVersions(sopDocumentId)` — `sop_document_versions`'ı `sop_document_id` ile filtreleyip `archived_at DESC` sıralı döner (salt-okunur).

## Frontend Değişikliği: `src/components/admin/SopRepositoryPanel.vue`

- Kategori dropdown/datalist (mevcut kategorilerden + serbest giriş) + arama input'u, `filterSopDocuments()` ile listeyi filtreler.
- Her SOP satırına "Geçmiş Sürümler" bağlantısı — tıklanınca `fetchSopDocumentVersions()` çağrılıp bir liste/modal gösterilir (mevcut `history-modal` deseni, `AdminView.vue`'daki audit tek-kayıt geçmişi görünümüyle benzer).
