-- =====================================================
-- Self-registration: allow a new signup to set its own country_code
-- (data scoping only — role always starts as 'viewer', never settable by the
-- user themselves, to prevent privilege escalation via signup metadata).
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, country_code)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'country_code', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Lets a logged-in user update their OWN profile row (e.g. full_name, or
-- country_code if they didn't set it at signup) — still cannot change `role`,
-- since role changes require super_admin (existing "super_admin_update_profiles"
-- policy is a separate, additional policy — Postgres UPDATE policies are ORed,
-- so this one only ever WIDENS what a user can touch on their own row, never
-- narrows the super_admin path). Enforced at the RLS level via a trigger check
-- below rather than trusting the client to never send a `role` change.
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION prevent_self_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only constrain self-service updates; a super_admin (caller role checked via
  -- current_profile_role(), defined in 20260703_data_sources.sql) may still
  -- change anyone's role via the separate super_admin_update_profiles policy.
  IF NEW.role IS DISTINCT FROM OLD.role AND current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'only super_admin may change role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_role_escalation ON profiles;
CREATE TRIGGER prevent_self_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_role_escalation();
