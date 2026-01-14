-- Fix RLS Policies for pos table (purchase orders)
-- This script enables RLS and creates policies to allow appropriate access

-- Step 1: Enable RLS on the table (if not already enabled)
ALTER TABLE pos ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on pos table (to recreate them cleanly)
-- This ensures we remove any broken policies from previous attempts
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'pos') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON pos';
    END LOOP;
END $$;

-- Step 3: Create SELECT policy - Admins can view all purchase orders
CREATE POLICY "Admins can view all pos"
ON pos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id::text = auth.uid()::text
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Step 4: Create SELECT policy - Users can view purchase orders assigned to them
CREATE POLICY "Users can view assigned pos"
ON pos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_purchase_orders
    WHERE user_purchase_orders.purchase_order_id::text = pos.id::text
    AND user_purchase_orders.user_id::text = auth.uid()::text
  )
  OR
  -- Allow if user has no assignments (for initial setup)
  NOT EXISTS (
    SELECT 1 FROM user_purchase_orders
    WHERE user_purchase_orders.user_id::text = auth.uid()::text
  )
);

-- Step 5: Create INSERT policy - Only admins can insert
CREATE POLICY "Admins can insert pos"
ON pos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id::text = auth.uid()::text
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Step 6: Create UPDATE policy - Only admins can update
CREATE POLICY "Admins can update pos"
ON pos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id::text = auth.uid()::text
    AND user_profiles.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id::text = auth.uid()::text
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Step 7: Create DELETE policy - Only admins can delete
CREATE POLICY "Admins can delete pos"
ON pos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id::text = auth.uid()::text
    AND user_profiles.role IN ('admin', 'super_admin')
  )
);

-- Verification: Check that policies were created
-- Note: If you get errors here, it means there are still broken policies.
-- Run cleanup_pos_policies.sql first, then re-run this script.
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'pos'
  AND schemaname = 'public'
ORDER BY policyname;
