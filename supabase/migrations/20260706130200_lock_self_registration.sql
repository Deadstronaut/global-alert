-- =====================================================
-- Close the orphaned self-registration capability (spec 004, gap 5)
--
-- 20260703120400_registration_country_code.sql let handle_new_user() read
-- country_code from signup metadata, implying a self-serve signup path — but
-- docs/security_roles_protocol.md §1 mandates "No Public Registration" and no
-- /register UI exists. This reverts that trigger's metadata read, and closes
-- a second, related gap: users_update_own_profile (same migration) lets a
-- user update ANY column on their own row, and the existing
-- prevent_self_role_escalation trigger only ever blocked self-service `role`
-- changes — country_code/org_id were never actually protected.
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_self_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only constrain self-service updates; a super_admin (or a country_admin/
  -- org_admin acting through their own scoped UPDATE policy from
  -- 20260706130000_profiles_scoped_rls.sql) may still change another user's
  -- role/country_code/org_id via those separate, additional policies —
  -- Postgres UPDATE policies are OR'd, so this trigger only ever narrows the
  -- self-service (`users_update_own_profile`) path, never the admin paths.
  IF NEW.role IS DISTINCT FROM OLD.role AND current_profile_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'only super_admin may change role';
  END IF;

  IF OLD.id = auth.uid() AND current_profile_role() <> 'super_admin' THEN
    IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
      RAISE EXCEPTION 'you cannot change your own country_code';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'you cannot change your own org_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
