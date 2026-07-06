-- =====================================================
-- Fix: log_table_change() hardcoded NEW.id/OLD.id, which raises
-- "record \"new\" has no field \"id\"" on any table whose primary key
-- isn't literally named `id` — e.g. country_boundaries (PK country_code),
-- discovered via a live boundary-upload test that failed with this error.
-- Since the audit trigger runs AFTER INSERT/UPDATE/DELETE in the same
-- transaction, the error rolled back the whole write, silently breaking
-- the country_boundaries upload feature end-to-end for every country.
--
-- Fix: pull the id via to_jsonb(...)->>'id' instead of direct field
-- access — returns NULL for tables without an `id` column instead of
-- erroring, same behavior as before for every table that does have one.
-- =====================================================

CREATE OR REPLACE FUNCTION log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (action, table_name, record_id, new_data)
    VALUES ('INSERT', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (action, table_name, record_id, old_data, new_data)
    VALUES ('UPDATE', TG_TABLE_NAME, to_jsonb(NEW)->>'id', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (action, table_name, record_id, old_data)
    VALUES ('DELETE', TG_TABLE_NAME, to_jsonb(OLD)->>'id', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
