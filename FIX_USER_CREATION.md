# Fix: Error Adding Employee - RLS Policy Violation

## Problem
When trying to add a new user through the Admin Panel, you get this error:
```
new row violates row-level security policy for table "user_profiles"
```

## Solution

### Step 1: Run the RLS Policy Fix
1. Go to Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste this SQL:

```sql
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
```

6. Click **Run** (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

### Step 2: Set Environment Variable
The server action needs the Supabase Service Role Key to create auth users.

1. Go to Supabase Dashboard → **Settings** → **API**
2. Find **service_role** key (keep this secret!)
3. Add it to your `.env.local` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Important**: Never commit this key to git! It should already be in `.gitignore`.

### Step 3: Restart Your Dev Server
After adding the environment variable:
```bash
# Stop your dev server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 4: Deploy to Vercel
If you're deploying to Vercel, add the environment variable there too:

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add:
   - **Name**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: (paste your service role key)
3. Click **Save**
4. Redeploy your application

## How It Works Now

1. Admin clicks "Add User" and fills in the form
2. The form submits to a **server action** (`/actions/create-user`)
3. The server action:
   - Verifies the current user is an admin
   - Uses the **service role key** to create the auth user (if they don't exist)
   - Creates the user profile linked to the auth user
   - Returns success/error

## Testing

1. Go to **Admin Panel** → **Users**
2. Click **Add User**
3. Fill in:
   - Name: Test User
   - Email: test@example.com
   - Role: Employee
4. Click **Add User**
5. The user should be created successfully!

## Troubleshooting

### "Unauthorized: Admin access required"
- Make sure you're logged in as an admin/super_admin
- Check your role in the database:
  ```sql
  SELECT email, role FROM user_profiles WHERE email = 'your-email@example.com';
  ```

### "Missing Supabase admin environment variables"
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- Restart your dev server after adding it

### "Failed to create auth user"
- Check that the email doesn't already exist in `auth.users`
- Verify the service role key is correct
- Check Supabase logs for more details
