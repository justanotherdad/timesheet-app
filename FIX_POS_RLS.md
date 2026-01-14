# Fix: RLS Disabled on `pos` Table

## Problem
Supabase Security Advisor shows:
- **Error:** "RLS Disabled in Public"
- **Table:** `public.pos`
- **Description:** Row Level Security (RLS) has not been enabled on this table

## Solution: Enable RLS and Create Policies

### Steps to Fix:

1. **Go to Supabase Dashboard**
   - Navigate to https://app.supabase.com
   - Select your project
   - Make sure you're on the **PRODUCTION** environment (or the correct environment)

2. **Open SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

3. **If you're getting type mismatch errors:**
   - First run `supabase/cleanup_pos_policies.sql` to remove any broken policies
   - This will drop all existing policies on the `pos` table
   - Click **Run** after pasting the cleanup script

4. **Run the Fix Script**
   - Copy the entire contents of `supabase/fix_pos_rls.sql`
   - Paste into the SQL Editor
   - Click **Run** (or press Cmd/Ctrl + Enter)

4. **Verify the Fix**
   - The script will output a list of policies created
   - You should see policies like:
     - "Admins can view all pos"
     - "Users can view assigned pos"
     - "Admins can insert pos"
     - "Admins can update pos"
     - "Admins can delete pos"

5. **Check Security Advisor**
   - Go back to **Security Advisor** in the left sidebar
   - Click **Refresh** button
   - The error for `public.pos` should be resolved

## What the Script Does

The script:
1. ✅ Enables RLS on `pos` table
2. ✅ Drops existing policies (if any) to recreate them cleanly
3. ✅ Creates SELECT policies for:
   - Admins viewing all purchase orders
   - Users viewing purchase orders assigned to them (via `user_purchase_orders` junction table)
4. ✅ Creates INSERT policy (only admins can insert)
5. ✅ Creates UPDATE policy (only admins can update)
6. ✅ Creates DELETE policy (only admins can delete)

## Policy Details

### For Admins/Super Admins:
- Can view all purchase orders
- Can insert, update, and delete purchase orders

### For Regular Users:
- Can view purchase orders assigned to them via the `user_purchase_orders` junction table
- Cannot insert, update, or delete purchase orders

## Note

If the table is actually named `purchase_orders` instead of `pos`, you may need to:
1. Check the actual table name in Supabase Table Editor
2. Update the script to use the correct table name
3. Or create an alias/view if `pos` is a view

## Verification Query

After running the fix, verify with this query:

```sql
SELECT 
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'pos'
ORDER BY policyname;
```

You should see 5 policies listed.
