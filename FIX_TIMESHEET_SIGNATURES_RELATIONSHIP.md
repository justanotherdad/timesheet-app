# Fix: Timesheet Signatures Relationship Error

## Problem
When clicking "View" or "Export" on a timesheet, you get the error:
**"Could not find a relationship between 'weekly_timesheets' and 'timesheet_signatures' in the schema cache."**

## Root Cause
Supabase couldn't automatically detect the foreign key relationship between `weekly_timesheets` and `timesheet_signatures` tables when trying to join them in a nested query.

## Solution Applied
I've updated the code to query signatures separately instead of trying to nest them in the main query. This avoids the relationship detection issue entirely.

### Files Updated:
1. `/app/dashboard/timesheets/[id]/page.tsx` - View page
2. `/app/dashboard/timesheets/[id]/export/page.tsx` - Export page

### What Changed:
- **Before:** Single query trying to join `timesheet_signatures` nested inside `weekly_timesheets` query
- **After:** Two separate queries:
  1. Query `weekly_timesheets` with `user_profiles` (owner info)
  2. Query `timesheet_signatures` separately with `user_profiles` (signer info)
  3. Attach signatures to the timesheet object manually

## Optional: Fix Database Foreign Key (If Still Having Issues)

If you're still experiencing issues, you can ensure the foreign key relationship exists in the database by running:

**File:** `supabase/fix_timesheet_signatures_relationship.sql`

This script will:
1. Check if `timesheet_signatures.timesheet_id` column exists
2. Create foreign key constraint to `weekly_timesheets.id` if it doesn't exist
3. Check if `timesheet_signatures.signer_id` column exists
4. Create foreign key constraint to `user_profiles.id` if it doesn't exist
5. Show verification of all foreign keys

### To Run:
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `supabase/fix_timesheet_signatures_relationship.sql`
3. Click "Run"

## Testing
After the code changes are deployed:
1. Go to "My Timesheets"
2. Click "View" on a draft timesheet - should now work ✅
3. Click "Export" on a draft timesheet - should now work ✅

The timesheet should display with all signatures (if any exist) in the approvals section.
