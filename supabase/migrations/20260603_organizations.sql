-- =====================================================
-- organizations tablosu
-- Hiyerarşik yapı: Bakanlık → Müdürlük → Saha ekibi
--
-- Örnek:
--   Türkiye Afet ve Acil Durum Yönetimi (AFAD)
--     └── İstanbul AFAD
--           └── Kadıköy Saha Ekibi
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   VARCHAR(2)  NOT NULL,
  name           TEXT        NOT NULL,
  type           TEXT,                    -- 'fire', 'flood', 'earthquake', 'health', 'general'
  parent_org_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_country ON organizations (country_code);
CREATE INDEX IF NOT EXISTS idx_org_parent  ON organizations (parent_org_id);

-- profiles.org_id → organizations FK (profiles tablosu zaten oluşturulduysa)
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_org
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- organizations okuma politikası
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Super admin: tüm organizasyonları görebilir
CREATE POLICY "super_admin_read_all_orgs" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- Country admin/org_admin: sadece kendi ülkesindeki organizasyonları görebilir
CREATE POLICY "country_users_read_own_country_orgs" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.country_code = organizations.country_code
    )
  );
