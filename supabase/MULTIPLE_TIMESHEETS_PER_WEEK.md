# Multiple Timesheets Per Week

The application now supports multiple timesheets per user per week (e.g. for different projects or corrections).

## Database Migration

If your `weekly_timesheets` table has a unique constraint on `(user_id, week_ending)`, you must remove it:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase/migrations/20250224_allow_multiple_timesheets_per_week.sql`
3. Copy and paste the SQL into a new query
4. Click **Run**

The migration will find and drop any unique constraint on `(user_id, week_ending)`.

If you get an error that the constraint doesn't exist, your database may already allow multiple timesheets per week.
