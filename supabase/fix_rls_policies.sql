-- Fix RLS policies to prevent infinite recursion
-- Run this in Supabase SQL Editor

-- Drop the problematic INSERT policy
DROP POLICY IF EXISTS "Admins can insert user profiles" ON user_profiles;

-- Create a new policy that allows users to insert their own profile
-- This is needed for signup to work
CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Also allow service role to insert (for admin-created users)
-- This uses a function to check service role
CREATE POLICY "Service role can insert user profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Fix the SELECT policies to avoid recursion
-- The current policies query user_profiles which can cause recursion
-- We'll use a security definer function instead

-- Create a function to check if user is admin (avoids recursion)
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

-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update user profiles" ON user_profiles;

-- Recreate with function to avoid recursion
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update user profiles"
  ON user_profiles FOR UPDATE
  USING (is_admin(auth.uid()));
