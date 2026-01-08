-- Fix RLS policy to allow admins to insert user profiles for other users
-- This allows admins to create user profiles without RLS violations

-- Drop the existing INSERT policy if it exists
DROP POLICY IF EXISTS "Admins can insert user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Create or replace the is_admin function to avoid recursion
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id 
    AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow admins to insert profiles for other users
-- This uses the is_admin function which is SECURITY DEFINER to avoid recursion
CREATE POLICY "Admins can insert user profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (
    -- Allow if the user is inserting their own profile
    auth.uid() = id
    OR
    -- Allow if the current user is an admin (using the function to avoid recursion)
    is_admin(auth.uid())
  );
