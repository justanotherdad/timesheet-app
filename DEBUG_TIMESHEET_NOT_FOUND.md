# Debug: Timesheet Not Found Issue

## Observations from Screenshots

1. **weekly_timesheets table** shows 2 records:
   - ID: `68ae0cf3-7ae7-46c7-a6e1-97343c5ee5af`, week_ending: 2026-01-18, status: draft
   - ID: `05e98346-af68-4b3a-8858-02cd7c210abf`, week_ending: 2026-01-11, status: draft
   - Both have `user_id: a2d69634-3d79-4ab9-b042-1eb16d9ad6df`

2. **timesheet_entries table** shows 1 record:
   - ID: `cb58e22a-9eeb-476b-a840-21421269831e`
   - `timesheet_id: 68ae0cf3-7ae7-46c7-a6e1-97343c5ee5af` (matches first weekly_timesheet)
   - task_description: Project Management

3. **User manually navigated to both IDs** but got "Timesheet not found"

## Likely Causes

### 1. RLS (Row Level Security) Issue
The records exist, but RLS policies might be blocking access when the app queries them.

**Check:** Run this SQL in Supabase to see if your user can access the records:
```sql
-- This simulates what the app sees (with RLS)
-- Run this in the SQL Editor - it uses your current session
SELECT id, user_id, week_ending, status
FROM weekly_timesheets
WHERE id IN (
  '68ae0cf3-7ae7-46c7-a6e1-97343c5ee5af',
  '05e98346-af68-4b3a-8858-02cd7c210abf'
);
```

If this returns 0 rows → RLS is blocking access
If this returns 2 rows → RLS is fine, issue is elsewhere

### 2. Query Error Not Being Checked
The code might be failing silently. I've updated the detail page to check for errors.

### 3. User ID Mismatch
The `user_id` in the timesheet (`a2d69634-3d79-4ab9-b042-1eb16d9ad6df`) must match the logged-in user's ID.

**Check:** What is your logged-in user ID?
- Go to browser console
- Check what user ID is being used
- Or check in Supabase: What's your auth.users ID vs the user_id in weekly_timesheets?

---

## Next Steps

1. **Check RLS Policies:**
   - Go to Supabase → Authentication → Policies
   - Check `weekly_timesheets` table policies
   - Make sure users can SELECT their own timesheets

2. **Check Your User ID:**
   - In Supabase, go to Authentication → Users
   - Find your user and copy the ID
   - Does it match `a2d69634-3d79-4ab9-b042-1eb16d9ad6df`?

3. **Check Browser Console:**
   - Open browser developer tools (F12)
   - Go to Console tab
   - Navigate to a timesheet detail page
   - Look for any errors

4. **Check Vercel Logs:**
   - Go to Vercel dashboard
   - Check function logs for the detail page
   - Look for "Timesheet query error" messages

---

## Quick Test

Try this SQL to verify your user can see the timesheets:

```sql
-- Check your current auth user
SELECT auth.uid() as current_user_id;

-- Check if you can see the timesheets (with RLS)
SELECT id, user_id, week_ending, status
FROM weekly_timesheets
WHERE user_id = auth.uid();
```

If this returns 0 rows but the records exist → RLS issue
If this returns the records → Issue is in the application code
