# Fix: Empty Timesheets Page - RLS Issue

## Problem
- My Timesheets page (`/dashboard/timesheets`) is empty
- Timesheets exist in database (visible in Supabase SQL Editor)
- Detail pages show "Timesheet not found"
- **Root Cause:** RLS (Row Level Security) policies are blocking access

## Solution: Fix RLS Policies

The `weekly_timesheets` table needs RLS policies that allow:
1. Users to SELECT/INSERT/UPDATE/DELETE their own timesheets
2. Admins to SELECT/UPDATE/DELETE all timesheets
3. Managers/Supervisors to SELECT their reports' timesheets

### Steps to Fix:

1. **Go to Supabase Dashboard**
   - Navigate to https://app.supabase.com
   - Select your project

2. **Open SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

3. **Run the Fix Script**
   - Copy the entire contents of `supabase/fix_weekly_timesheets_rls.sql`
   - Paste into the SQL Editor
   - Click **Run** (or press Cmd/Ctrl + Enter)

4. **Verify the Fix**
   - The script will output a list of policies created
   - You should see policies like:
     - "Users can view their own timesheets"
     - "Admins can view all timesheets"
     - "Managers can view reports' timesheets"
     - etc.

5. **Test the Application**
   - Go to `/dashboard/timesheets` - should now show your timesheets
   - Click "View" on a timesheet - should now work
   - Try creating a new timesheet - should work

## What the Script Does

The script:
1. ✅ Enables RLS on `weekly_timesheets` table (if not already enabled)
2. ✅ Drops existing policies (to recreate them cleanly)
3. ✅ Creates SELECT policies for:
   - Users viewing their own timesheets
   - Admins viewing all timesheets
   - Managers/Supervisors viewing their reports' timesheets
4. ✅ Creates INSERT policy (users can insert their own)
5. ✅ Creates UPDATE policies (users can update their own, admins can update all)
6. ✅ Creates DELETE policies (users can delete their own drafts, admins can delete all)

## Verification Queries

After running the fix, verify with these queries:

### Check if you can see your timesheets (as your user):
```sql
-- This simulates what the app sees (with RLS)
SELECT id, user_id, week_ending, status
FROM weekly_timesheets
WHERE user_id = auth.uid();
```

### Check all policies:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'weekly_timesheets'
ORDER BY policyname;
```

## If Still Not Working

1. **Check Your User ID**
   - In Supabase: Authentication → Users
   - Find your user and copy the ID
   - Does it match the `user_id` in your timesheets?

2. **Check RLS is Enabled**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   AND tablename = 'weekly_timesheets';
   ```
   - `rowsecurity` should be `true`

3. **Check User Profile Role**
   ```sql
   SELECT id, email, role
   FROM user_profiles
   WHERE id = auth.uid();
   ```
   - Make sure you have a profile and role

4. **Check Browser Console**
   - Open browser dev tools (F12)
   - Go to Console tab
   - Navigate to `/dashboard/timesheets`
   - Look for any errors

5. **Check Vercel Logs**
   - Go to Vercel dashboard
   - Check function logs
   - Look for query errors
