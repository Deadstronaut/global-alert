-- =====================================================
-- Fix: same search_path bug as handle_new_user(), but in log_table_change().
-- Once handle_new_user()'s profiles insert succeeds (previous migration),
-- the audit_profiles AFTER INSERT trigger fires log_table_change(), which is
-- also SECURITY DEFINER without SET search_path — would hit the exact same
-- 42P01 "relation audit_log does not exist" under GoTrue's session next.
-- =====================================================

CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, new_data)
    VALUES ('INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, old_data, new_data)
    VALUES ('UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (action, table_name, record_id, old_data)
    VALUES ('DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
