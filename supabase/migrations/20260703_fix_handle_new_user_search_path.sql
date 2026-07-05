-- =====================================================
-- Fix: signup 500 error ("relation \"profiles\" does not exist")
--
-- Root cause: handle_new_user() is SECURITY DEFINER but never set its own
-- search_path. GoTrue's Postgres session (running as its own auth role) does
-- not have `public` on its default search_path, so the unqualified
-- `INSERT INTO profiles` inside the trigger fails with 42P01, aborting the
-- transaction (25P02) and surfacing to the client as a 500 on /auth/v1/signup.
--
-- Confirmed via Supabase Dashboard Postgres logs showing repeated
-- 42P01 relation "profiles" does not exist + 25P02 pairs at every signup
-- attempt.
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, country_code)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'country_code', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
