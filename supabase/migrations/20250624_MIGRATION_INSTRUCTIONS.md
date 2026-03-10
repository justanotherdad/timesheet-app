# Migration: Client Contact & Budget Access (20250624)

## What This Does

1. **Client Contact Name** – Adds `client_contact_name` to `purchase_orders` so each PO can have its own client contact.

2. **Budget Access** – Adds `po_budget_access` table so admins can grant budget access to any user with a profile. Users with access see the PO budget (limited view for non-admin roles).

## Migration Steps

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase/migrations/20250624_client_contact_and_budget_access.sql`
3. Copy and paste the SQL into a new query
4. Click **Run**

## After Migration

- **Client Contact**: Edit Client & PO Information on a budget to add the client contact name per PO.
- **Budget Access**: Admins see a "Budget Access" container on each PO budget where they can grant or revoke access for any user with a profile. Users with access (e.g. supervisors, employees) see their own timesheet hours and limited budget info.
