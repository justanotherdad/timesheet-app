# Fix "Infinite Recursion" Error and Find Role Column

## 🔴 Problem 1: Infinite Recursion Error

The error "infinite recursion detected in policy for relation 'user_profiles'" happens because the RLS policy tries to check if you're an admin by querying the `user_profiles` table, but you're trying to INSERT into that same table, creating a loop.

## ✅ Solution: Fix RLS Policies

### Step 1: Go to Supabase SQL Editor

1. Go to: https://app.supabase.com
2. Select your project
3. Left sidebar → **SQL Editor**
4. Click **New Query**

### Step 2: Run This SQL

Copy and paste this entire SQL script:

```sql
-- Fix RLS policies to prevent infinite recursion

-- Drop the problematic INSERT policy
DROP POLICY IF EXISTS "Admins can insert user profiles" ON user_profiles;

-- Create a new policy that allows users to insert their own profile
-- This is needed for signup to work
CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Fix the SELECT policies to avoid recursion
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
```

### Step 3: Click "Run" (or press Cmd/Ctrl + Enter)

### Step 4: Verify

- You should see "Success. No rows returned"
- The error should be fixed

---

## 🔍 Problem 2: Finding the Role Column

The `role` column exists in the `user_profiles` table. Here's how to find and edit it:

### Method 1: Using Table Editor (Easiest)

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Open Table Editor:**
   - Left sidebar → **Table Editor**
   - Click on **`user_profiles`** table

3. **Find Your User:**
   - Look for your email: `david.fletes@ctg-gmp.com`
   - Or your name: `David Fletes`
   - The row should show columns: `id`, `email`, `name`, `role`, `reports_to_id`, etc.

4. **Edit the Role:**
   - Click on the row (or click the edit icon)
   - Find the **`role`** column
   - Change it from `employee` to `super_admin`
   - Click **Save** (or press Enter)

### Method 2: Using SQL Editor (Alternative)

1. **Go to SQL Editor:**
   - Left sidebar → **SQL Editor**
   - Click **New Query**

2. **Run This SQL:**
   ```sql
   -- First, check your current role
   SELECT email, name, role
   FROM user_profiles
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```

3. **Update Your Role:**
   ```sql
   UPDATE user_profiles
   SET role = 'super_admin'
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```

4. **Verify:**
   ```sql
   SELECT email, name, role
   FROM user_profiles
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```
   Should show `role = 'super_admin'`

---

## 📋 Step-by-Step: Make Yourself Admin

### Quick Method:

1. **Fix RLS policies first** (run the SQL above)
2. **Go to Table Editor:**
   - Table Editor → `user_profiles`
   - Find your email
   - Click to edit
   - Change `role` to `super_admin`
   - Save
3. **Log out and log back in**
4. **Check dashboard** - you should see "Admin Panel"

---

## 🎯 What the Fix Does

1. **Allows users to create their own profile** (needed for signup)
2. **Uses a function to check admin status** (avoids recursion)
3. **Keeps admin-only access** for viewing/updating all profiles

---

## 🆘 If You Still Can't Find the Role Column

### Check Table Structure:

1. **In Table Editor:**
   - Click on `user_profiles` table
   - Look at the column headers at the top
   - You should see: `id`, `email`, `name`, `role`, `reports_to_id`, `created_at`, `updated_at`

2. **If role column is missing:**
   - The table might not be set up correctly
   - Run the schema SQL again (from `supabase/schema.sql`)

3. **Check if table exists:**
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'user_profiles'
   ORDER BY ordinal_position;
   ```

---

## ✅ After Fixing

1. ✅ RLS recursion error should be gone
2. ✅ You can sign up (though signup is disabled in the app)
3. ✅ You can edit your role in the database
4. ✅ Once you're `super_admin`, you can manage users from Admin Panel

---

**Remember:** After making yourself admin, log out and log back in for the changes to take effect!
