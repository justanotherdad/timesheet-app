# Approval Data Snapshot Migration

## What This Does

When a supervisor, manager, or final approver changes in a user's profile, historical timesheet approval data could previously show incorrect or missing information. This migration snapshots the approver's name at the time of approval so it remains accurate even if:

- The approver's name changes in their profile
- The employee is reassigned to a different supervisor/manager/final approver

## Migration Steps

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase/migrations/20250224_add_signer_name_to_timesheet_signatures.sql`
3. Copy and paste the SQL into a new query
4. Click **Run**

The migration will:
- Add a `signer_name` column to `timesheet_signatures`
- Backfill existing signatures with the current name from `user_profiles` (for historical data)

## After Migration

New approvals will automatically store the signer's name at the time of signing. The display and export will use this snapshot, falling back to the live profile name only when `signer_name` is not set (e.g., for very old records before backfill).
