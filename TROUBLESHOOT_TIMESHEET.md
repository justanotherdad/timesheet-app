# Troubleshooting: Timesheet Not Found Issue

## Problem
- Timesheet appears in dashboard as "draft"
- Clicking "View" gives "Timesheet not found"
- In Supabase, only see entries in `timesheet_entries` table

## Diagnosis

### Step 1: Check weekly_timesheets table

Run this SQL in Supabase SQL Editor to see ALL timesheets:

```sql
SELECT id, user_id, week_ending, status, created_at, updated_at
FROM weekly_timesheets
ORDER BY created_at DESC
LIMIT 20;
```

### Step 2: Check timesheet_entries table

Run this SQL to see entries and their timesheet IDs:

```sql
SELECT id, timesheet_id, task_description, created_at
FROM timesheet_entries
ORDER BY created_at DESC
LIMIT 20;
```

### Step 3: Compare the IDs

The `timesheet_entries.timesheet_id` should match `weekly_timesheets.id`.

If you see:
- Entries in `timesheet_entries` but NO matching `weekly_timesheets` record → Data corruption
- Entries in `timesheet_entries` with `timesheet_id` that doesn't exist in `weekly_timesheets` → Orphaned entries
- `weekly_timesheets` record exists but detail page says "not found" → ID mismatch or RLS issue

---

## Most Likely Issue

Since the dashboard shows the timesheet, the `weekly_timesheets` record **does exist**. The issue is likely:

1. **ID Mismatch**: The ID in the URL doesn't match the ID in `weekly_timesheets`
2. **RLS (Row Level Security) Issue**: The timesheet exists but RLS policies are blocking access
3. **Cache Issue**: The dashboard is showing cached/stale data

---

## Quick Fix: Check the Actual ID

1. In Supabase, go to **Table Editor**
2. Open `weekly_timesheets` table
3. Find your timesheet (look for your user_id and draft status)
4. Copy the `id` field
5. Manually navigate to: `/dashboard/timesheets/[paste-id-here]`
6. Does it work now?

If yes → The dashboard is using the wrong ID
If no → There's an RLS or other access issue

---

## Verify RLS Policies

Run this to check if you can see your timesheet:

```sql
-- Check what timesheets you can see (run as your user)
SELECT id, user_id, week_ending, status
FROM weekly_timesheets
WHERE status = 'draft'
ORDER BY created_at DESC;
```

---

## Possible Solutions

### Solution 1: If weekly_timesheets record is missing

If you have entries in `timesheet_entries` but NO `weekly_timesheets` record:

1. Get the `timesheet_id` from `timesheet_entries`
2. Create the missing `weekly_timesheets` record:

```sql
-- First, check what user_id and week_ending to use
-- (You'll need to get this from your user profile and the entries)

-- Then create the missing record:
INSERT INTO weekly_timesheets (id, user_id, week_ending, week_starting, status, created_at, updated_at)
VALUES (
  '[timesheet_id_from_entries]',
  '[your_user_id]',
  '[week_ending_date]',
  '[week_starting_date]',
  'draft',
  NOW(),
  NOW()
);
```

### Solution 2: If IDs don't match

If the dashboard shows one ID but the database has a different ID:

1. Check browser console for errors
2. Check Vercel logs for errors
3. Try refreshing the dashboard page

### Solution 3: Clear cache and retry

1. Hard refresh the dashboard: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Try again

---

## Need More Help?

If none of these work, please provide:
1. The ID shown in the dashboard URL when you click "View"
2. The ID(s) you see in `weekly_timesheets` table
3. The `timesheet_id` values you see in `timesheet_entries` table
4. Any error messages from browser console
