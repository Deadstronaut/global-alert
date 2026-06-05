-- =====================================================
-- profiles tablosu
-- Supabase Auth kullanıcılarına rol ve ülke atar.
-- super_admin → country_code NULL (tüm ülkeleri görür)
-- country_admin → country_code 'tr' gibi (sadece kendi ülkesi)
-- org_admin / viewer → ayrıca org_id ile sınırlandırılır
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  full_name    TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer'
                 CHECK (role IN ('super_admin', 'country_admin', 'org_admin', 'viewer')),
  country_code VARCHAR(2),   -- NULL = sınırsız (super_admin)
  org_id       UUID,         -- organizations tablosuna FK, Phase 3'te eklenecek
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Yeni kayıt oluşunca profiles'a otomatik satır ekle
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- profiles okuma: herkes kendi profilini görsün
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "super_admin_read_all_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_update_profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );
