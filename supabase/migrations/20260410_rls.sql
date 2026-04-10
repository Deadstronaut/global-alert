-- =====================================================
-- Row Level Security - Tüm disaster tabloları
-- Herkes okuyabilir (public read), sadece service_role yazabilir
-- =====================================================

-- earthquake
ALTER TABLE earthquake ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_earthquake" ON earthquake;
CREATE POLICY "public_read_earthquake" ON earthquake
  FOR SELECT USING (true);

-- wildfire
ALTER TABLE wildfire ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_wildfire" ON wildfire;
CREATE POLICY "public_read_wildfire" ON wildfire
  FOR SELECT USING (true);

-- flood
ALTER TABLE flood ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_flood" ON flood;
CREATE POLICY "public_read_flood" ON flood
  FOR SELECT USING (true);

-- drought
ALTER TABLE drought ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_drought" ON drought;
CREATE POLICY "public_read_drought" ON drought
  FOR SELECT USING (true);

-- food_security
ALTER TABLE food_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_food_security" ON food_security;
CREATE POLICY "public_read_food_security" ON food_security
  FOR SELECT USING (true);

-- tsunami
ALTER TABLE tsunami ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_tsunami" ON tsunami;
CREATE POLICY "public_read_tsunami" ON tsunami
  FOR SELECT USING (true);

-- cyclone
ALTER TABLE cyclone ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_cyclone" ON cyclone;
CREATE POLICY "public_read_cyclone" ON cyclone
  FOR SELECT USING (true);

-- volcano
ALTER TABLE volcano ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_volcano" ON volcano;
CREATE POLICY "public_read_volcano" ON volcano
  FOR SELECT USING (true);

-- epidemic
ALTER TABLE epidemic ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_epidemic" ON epidemic;
CREATE POLICY "public_read_epidemic" ON epidemic
  FOR SELECT USING (true);

-- disaster (genel)
ALTER TABLE disaster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_disaster" ON disaster;
CREATE POLICY "public_read_disaster" ON disaster
  FOR SELECT USING (true);

-- early_warnings
ALTER TABLE early_warnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_early_warnings" ON early_warnings;
CREATE POLICY "public_read_early_warnings" ON early_warnings
  FOR SELECT USING (true);
