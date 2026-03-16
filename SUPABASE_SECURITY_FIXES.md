# Supabase Security Advisor Fixes

This document describes what was fixed and what requires manual dashboard configuration.

## Fixes Applied via Migrations

### 1. RLS on Junction Tables (6 errors)

**Migration:** `supabase/migrations/20260218_enable_rls_junction_tables.sql`

Enabled Row Level Security on:
- `activity_purchase_orders`
- `activity_departments`
- `deliverable_departments`
- `deliverable_purchase_orders`
- `system_departments`
- `system_purchase_orders`

**Policies:**
- **SELECT:** All authenticated users (needed for timesheet form filtering)
- **INSERT/UPDATE/DELETE:** Only users with role `manager`, `admin`, or `super_admin`

### 2. RLS on Organization Tables (sites, departments, purchase_orders)

**Migration:** `supabase/migrations/20260218_fix_org_tables_rls.sql`

Fixes "new row violates row-level security policy" when managers add POs, sites, or departments. Adds INSERT/UPDATE/DELETE policies for users with role `manager`, `admin`, or `super_admin`.

### 3. Function Search Path (2 warnings)

**Migration:** `supabase/migrations/20260218_fix_function_search_path.sql`

Sets `search_path = public` on:
- `public.is_admin`
- `public.update_updated_at_column`

This prevents search_path injection attacks (CVE-2018-1058).

---

## Manual Fixes (Supabase Dashboard)

These must be configured in the Supabase Dashboard under **Auth** settings.

### 4. Auth OTP Long Expiry (warning)

**Location:** Auth → Providers → Email → **Email OTP Expiration**

- Set to **3600** (1 hour) if the Security Advisor flags the current value as too long
- Or keep at **86400** (1 day) if the warning is acceptable for your use case

### 5. Leaked Password Protection Disabled (warning)

**Location:** Auth → Providers → Email (or Auth settings)

- Enable **Leaked password protection** (or similar) in Supabase Auth settings
- This blocks users from setting passwords that appear in known breach databases

---

## Applying the Migrations

Run the migrations from the Supabase CLI or SQL Editor:

```bash
supabase db push
```

Or run each migration file manually in the Supabase SQL Editor.
