# Contract: Contact Directory CRUD

No new Edge Function needed — `contacts` is managed via direct Supabase client calls (`supabase.from('contacts')...`) gated entirely by RLS, the same pattern already used for `cap_drafts` and `data_sources` (not the `create-user`-style Edge Function pattern, which exists specifically because `auth.users` creation requires the service-role Admin API — plain table CRUD does not).

## Create / Update
- Client sends `{ full_name, email, whatsapp_number, preferred_language, country_code, region_code, hazard_type_filter, email_opt_in, whatsapp_opt_in, org_id }`.
- RLS `WITH CHECK` clauses enforce: super_admin → any `country_code`; country_admin/org_admin → `country_code` must equal the caller's own `profiles.country_code` (mirrors `country_admin_write_own_boundary` from spec 002's boundary-upload policy) — a client-supplied `country_code` that doesn't match is rejected by Postgres itself, not just hidden in the UI.
- Duplicate `(email, country_code)` → Postgres unique-constraint violation surfaces as a normal Supabase error; the UI reports it as "a contact with this email already exists in this country."

## Bulk CSV import
- Reuses `src/utils/fileParsers.js` (`parseDataFile`) and the existing chunked-upsert pattern from `FileImportForm.vue`, with a contacts-specific field map (`full_name, email, whatsapp_number, preferred_language, country_code, region_code, hazard_type_filter`) and the same per-row validation display (valid rows import, invalid rows list their row number + reason, matching FR-003).
- `.sql` remains rejected, consistent with the project's standing security exclusion.

## Deactivate (not delete)
- `supabase.from('contacts').update({ is_active: false })` — no DELETE policy is defined for country_admin/org_admin (only super_admin may hard-delete, mirroring `super_admin_delete_boundary`), keeping historical `dispatch_receipts.contact_id` references intact (FR-004).
