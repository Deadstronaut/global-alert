# GEWS - Security and Role-Based Access Control (RBAC) Protocol

This document defines the user hierarchy, account provisioning workflow, and access control matrix for the Global Early Warning System (GEWS).

## 1. System Access Philosophy
- **No Public Registration:** The system is closed to the public. There is no open "Sign Up" page.
- **Invite/Provisioning Only:** Accounts are strictly provisioned hierarchically from the top down.
- **Login Only:** The only entry point for users is a secure "Login" screen.

## 2. User Hierarchy & Roles

The system uses a strict top-down hierarchy. Permissions cascade downwards.

| Role | Entity Level | Description | Provisioning Power |
| :--- | :--- | :--- | :--- |
| **Super Admin** | United Nations (UN) / Core Team | Absolute access to all global data, system settings, and cross-country analytics. | Can create **Country Admins** and other Super Admins. |
| **Country Admin** | Ministry / Government Lead | Full access to all disaster and organizational data *only within their specific country*. | Can create **Org Admins** and **Viewers** for their country. |
| **Org Admin** | Local Agency / Directorate | Can manage local assets, personnel, and incidents specific to their organization (e.g., AFAD Istanbul). | Can create **Viewers** within their organization. |
| **Viewer (Personnel)** | Field Staff / Local User | Can view data, receive alerts, and possibly report incidents (if permitted), restricted to their org/country. | Cannot create accounts. |

## 3. Account Provisioning Workflow

1. **System Initialization:** The initial `Super Admin` accounts are created directly in the database/backend during deployment.
2. **Country Onboarding:** A `Super Admin` logs in, navigates to the "User Management" panel, and creates an account for a country's Ministry (e.g., Turkey Ministry of Interior). This account is assigned the `Country Admin` role and the `country_code` is set to `TR`.
3. **Local Organization Setup:** The `Country Admin` logs in. They can only see `TR` data. They create accounts for regional directorates, assigning them the `Org Admin` role.
4. **Personnel Onboarding:** `Org Admins` (or `Country Admins`) create standard accounts (`Viewer` role) for field personnel.

## 4. Security Enforcement (Row Level Security - RLS)

Security is enforced at the database level using PostgreSQL Row Level Security (RLS). This ensures that even if an API endpoint is directly accessed, the user cannot retrieve data outside their scope.

- **Super Admin RLS:** `country_code IS NULL`. The policy allows `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all rows.
- **Country Admin RLS:** The policy checks `auth.uid()` against the `profiles` table. If the user's `country_code` matches the row's `country_code`, access is granted.
- **Org Admin / Viewer RLS:** The policy checks both `country_code` and `org_id` to restrict access strictly to the user's assigned organization or region.

## 5. Next Steps for Implementation
1. **Remove Registration UI:** Ensure the frontend routing only exposes `/login`. Remove any `/register` or `/signup` views.
2. **User Management Dashboard:** Develop a protected UI specifically for Admins to invite/create users.
3. **Backend Invite API:** Use Supabase Admin API (`supabase.auth.admin.createUser`) or Magic Links to send secure account setup emails to newly provisioned users.
