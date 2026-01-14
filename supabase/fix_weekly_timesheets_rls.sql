-- Fix RLS Policies for weekly_timesheets table
-- This script checks and creates/updates RLS policies to allow users to see their own timesheets

-- Step 1: Enable RLS on the table (if not already enabled)
ALTER TABLE weekly_timesheets ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (to recreate them cleanly)
DROP POLICY IF EXISTS "Users can view their own timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Users can insert their own timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Users can update their own timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Users can delete their own draft timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Admins can view all timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Admins can manage all timesheets" ON weekly_timesheets;
DROP POLICY IF EXISTS "Managers can view reports' timesheets" ON weekly_timesheets;

-- Step 3: Create SELECT policy - Users can view their own timesheets
CREATE POLICY "Users can view their own timesheets"
ON weekly_timesheets
FOR SELECT
USING (auth.uid() = user_id);

-- Step 4: Create SELECT policy - Admins can view all timesheets
CREATE POLICY "Admins can view all timesheets"
ON weekly_timesheets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Step 5: Create SELECT policy - Managers/Supervisors can view their reports' timesheets
CREATE POLICY "Managers can view reports' timesheets"
ON weekly_timesheets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('manager', 'supervisor')
    AND EXISTS (
      SELECT 1 FROM user_profiles AS reports
      WHERE reports.id = weekly_timesheets.user_id
      AND reports.reports_to_id = auth.uid()
    )
  )
);

-- Step 6: Create INSERT policy - Users can insert their own timesheets
CREATE POLICY "Users can insert their own timesheets"
ON weekly_timesheets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Step 7: Create UPDATE policy - Users can update their own timesheets
CREATE POLICY "Users can update their own timesheets"
ON weekly_timesheets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 8: Create UPDATE policy - Admins can update all timesheets
CREATE POLICY "Admins can update all timesheets"
ON weekly_timesheets
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Step 9: Create DELETE policy - Users can delete their own draft timesheets
CREATE POLICY "Users can delete their own draft timesheets"
ON weekly_timesheets
FOR DELETE
USING (auth.uid() = user_id AND status = 'draft');

-- Step 10: Create DELETE policy - Admins can delete all timesheets
CREATE POLICY "Admins can delete all timesheets"
ON weekly_timesheets
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Verification: Check that policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'weekly_timesheets'
ORDER BY policyname;
