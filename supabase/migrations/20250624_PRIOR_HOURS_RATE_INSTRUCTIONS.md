# Migration: Prior Hours Billed Rate (20250624)

## What This Does

Adds `prior_hours_billed_rate` to `purchase_orders` so you can define the bill rate ($/hr) for prior hours billed. Cost = prior_hours_billed × prior_hours_billed_rate, which reduces **Budget Balance** (not PO Balance).

Also: **Prior amount spent** now affects **Budget Balance only**, not PO Balance. PO Balance = total budget - invoices only.

## Migration Steps

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase/migrations/20250624_prior_hours_billed_rate.sql`
3. Copy and paste the SQL into a new query
4. Click **Run**

## After Migration

- **Budget Detail** → Edit Budget Summary: You can now set "Prior Hours Bill Rate ($/hr)" when using prior hours billed.
- **Manage Organization** → PO card → Edit: Same fields available in the Prior Period Adjustment section.
- Prior amount spent and prior hours cost reduce Budget Balance only. PO Balance reflects invoices only.
