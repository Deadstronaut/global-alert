# Contract: Role-based route guard for `/admin`

## `src/router/index.js`

The existing `/admin` route definition gains a `meta.roles` array:

```js
{
  path: '/admin',
  name: 'admin',
  component: () => import('@/views/AdminView.vue'),
  meta: { roles: ['super_admin', 'country_admin', 'org_admin'] }
},
```

The existing `router.beforeEach` guard gains one additional check, inserted after the existing
`isLoggedIn` check and before returning `true`:

```js
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.init();
  if (to.meta.public) return true;
  if (!auth.isLoggedIn) return { name: 'login' };
  if (to.meta.roles && !to.meta.roles.includes(auth.session?.role)) {
    return { name: 'home' };
  }
  return true;
});
```

**Contract**: Any route carrying `meta.roles` MUST reject navigation (redirect to `home`) before
the target component is instantiated if `auth.session.role` is not in that list. This is enforced
by Vue Router's navigation-guard ordering — a `beforeEach` guard runs and resolves before the
matched component's `setup()`/`onMounted()` ever executes, which is what stops `AdminView.vue`'s
admin-only data fetches from firing for unauthorized roles (spec FR-001, US1).

**Non-goals**: This does not change per-tab visibility inside `AdminView.vue` (the existing
`canAdmin`/`canCreateUsers`/`canManageSource` computed properties and `v-if` gating remain exactly
as they are today) — it only gates whether the component mounts at all.
