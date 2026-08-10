-- =====================================================
-- Resource / Capacity Inventory (spec 062)
--
-- MHEWS gap (Preparedness & Response pillar): no field-capacity inventory
-- exists (equipment, personnel, vehicles, supplies) — shelters (spec 021)
-- track WHERE people can go, but nothing tracks WHAT resources a country/org
-- actually has on hand to respond. New standalone module, same 3-tier RLS
-- shape as contacts/shelters. Additive only.
-- =====================================================

CREATE TABLE IF NOT EXISTS resource_inventory (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   VARCHAR(2) NOT NULL,
  org_id         UUID REFERENCES organizations(id) ON DELETE SET NULL,
  resource_type  TEXT NOT NULL CHECK (resource_type IN ('personnel', 'equipment', 'vehicle', 'supply', 'other')),
  name           TEXT NOT NULL,
  quantity       NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit           TEXT,
  status         TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'deployed', 'depleted', 'maintenance')),
  region_code    TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_inventory_country ON resource_inventory (country_code, resource_type);

ALTER TABLE resource_inventory ENABLE ROW LEVEL SECURITY;

-- No anon read policy: on-hand response capacity is operationally sensitive
-- (reveals a country's actual preparedness gaps), same sensitivity class as
-- risk_indicators/cascade_rules.
DROP POLICY IF EXISTS "super_admin_resource_inventory_all" ON resource_inventory;
CREATE POLICY "super_admin_resource_inventory_all" ON resource_inventory
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_resource_inventory_own" ON resource_inventory;
CREATE POLICY "country_admin_resource_inventory_own" ON resource_inventory
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_resource_inventory_own" ON resource_inventory;
CREATE POLICY "org_admin_resource_inventory_own" ON resource_inventory
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_resource_inventory ON resource_inventory;
CREATE TRIGGER audit_resource_inventory
  AFTER INSERT OR UPDATE OR DELETE ON resource_inventory
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

CREATE OR REPLACE FUNCTION set_resource_inventory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_inventory_updated_at ON resource_inventory;
CREATE TRIGGER trg_resource_inventory_updated_at
  BEFORE UPDATE ON resource_inventory
  FOR EACH ROW EXECUTE FUNCTION set_resource_inventory_updated_at();
