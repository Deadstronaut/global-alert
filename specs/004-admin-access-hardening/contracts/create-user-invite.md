# Contract: `supabase/functions/create-user/index.ts` (modified — invite flow)

## What changes

- Request body **no longer accepts** `password`.
- All existing hierarchy enforcement (caller role → allowed target role/country/org, exactly as
  currently implemented) is **unchanged**.
- The account-creation call changes from:

  ```ts
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: country_code ? { country_code } : undefined,
  })
  ```

  to:

  ```ts
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: country_code ? { country_code } : undefined,
  })
  ```

- The subsequent service-role `UPDATE profiles SET role, country_code, org_id, region_code,
  full_name ...` step (which sets the actual requested scope, bypassing the self-escalation
  trigger since it runs as service role) is **unchanged**.

## Request (new shape)

```
POST /functions/v1/create-user
Authorization: Bearer <caller's access token>
Content-Type: application/json

{
  "email": "string",
  "role": "super_admin" | "country_admin" | "org_admin" | "viewer",
  "country_code": "string | null",
  "org_id": "uuid | null",
  "region_code": "string | null",
  "full_name": "string | null"
}
```

(`password` removed entirely from the contract.)

## Response

Unchanged shape (`{ id, email, role, country_code, org_id, region_code }`), plus the invited
user now receives a Supabase-sent invite email with a secure link to set their own password,
valid for however long that deployment's own Supabase project has configured (recommended
default: 48 hours — see research.md §4). This is a per-project Mailer OTP Expiry setting, not a
per-request parameter or anything this codebase hardcodes.

## Called by

`src/stores/auth.js`'s existing `createUser()` function drops the `password` parameter.
`AdminView.vue`'s user-creation form (`userForm`) removes its password input field entirely.
