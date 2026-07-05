# Contract: `supabase/functions/suspend-user/index.ts` (new Edge Function)

Follows the exact structure of the existing `create-user/index.ts`: resolve caller from their
bearer JWT via a service-role admin client, load the caller's `profiles` row, enforce a hierarchy
check, then perform the privileged action via the service-role client.

## Request

```
POST /functions/v1/suspend-user
Authorization: Bearer <caller's access token>
Content-Type: application/json

{
  "target_user_id": "uuid",
  "action": "suspend" | "reactivate"
}
```

## Server-side steps

1. Resolve caller via `admin.auth.getUser(bearerToken)` (401 if invalid — same as `create-user`).
2. Load caller's `profiles` row (`role`, `country_code`, `org_id`) via service-role client (403 if
   not found — same as `create-user`).
3. Reject (403) if caller's role is not one of `super_admin`, `country_admin`, `org_admin`.
4. Reject (400) if `target_user_id === caller's own id` — "cannot suspend your own account" (spec
   edge case, FR-008).
5. Load target's `profiles` row (404 if not found).
6. Hierarchy check (403 if violated):
   - `super_admin`: may target anyone (except self, already blocked in step 4).
   - `country_admin`: target's `role` must be `org_admin` or `viewer`, AND target's `country_code`
     must equal caller's `country_code`.
   - `org_admin`: target's `role` must be `viewer`, AND target's `country_code`/`org_id` must both
     equal caller's own.
7. If `action === 'suspend'`:
   - `UPDATE profiles SET is_active = false WHERE id = target_user_id` (service role — triggers the
     existing `audit_profiles` audit trigger automatically).
   - `admin.auth.admin.updateUserById(target_user_id, { ban_duration: '87600h' })`.
8. If `action === 'reactivate'`:
   - `UPDATE profiles SET is_active = true WHERE id = target_user_id`.
   - `admin.auth.admin.updateUserById(target_user_id, { ban_duration: 'none' })`.
9. Return `{ id: target_user_id, is_active: <new value> }` on success.

## Response

- `200`: `{ "id": "uuid", "is_active": false }` (or `true` for reactivate)
- `400`: `{ "error": "..." }` — bad request body, missing fields, or self-suspend attempt
- `401`: `{ "error": "Invalid session" }`
- `403`: `{ "error": "..." }` — caller not authorized, or hierarchy violation
- `404`: `{ "error": "Target user not found" }`
- `500`: `{ "error": "..." }` — unexpected DB/Auth Admin API failure

## Called by

`src/stores/auth.js` gains `suspendUser(targetUserId)` / `reactivateUser(targetUserId)` functions,
mirroring the existing `createUser()` function's `supabase.functions.invoke(...)` pattern.
`AdminView.vue`'s Users tab row actions gain a "Suspend"/"Reactivate" button next to the existing
"Revoke access" (role-downgrade) button — both remain available as distinct actions (spec
Acceptance Scenario US3.4).
