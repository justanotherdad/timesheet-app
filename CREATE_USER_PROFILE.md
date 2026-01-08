# Create Your User Profile

Your user exists in Authentication but not in `user_profiles` table. Here's how to create it.

---

## 🔍 Problem

- ✅ You exist in `auth.users` (Authentication)
- ❌ You don't exist in `user_profiles` table
- ❌ So the app can't find your role/permissions

---

## ✅ Solution: Create Profile Manually

### Method 1: Using SQL Editor (Recommended)

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Go to SQL Editor:**
   - Left sidebar → **SQL Editor**
   - Click **New Query**

3. **Get Your User ID:**
   First, find your user ID from Authentication:
   ```sql
   -- This shows your user ID
   SELECT id, email, raw_user_meta_data->>'name' as name
   FROM auth.users
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```
   
   Copy the `id` value (looks like: `a2d69634-3d79-4ab9-b042-1eb16d9ad6df`)

4. **Create Your Profile:**
   Replace `YOUR_USER_ID` with the ID from step 3:
   ```sql
   INSERT INTO user_profiles (id, email, name, role)
   VALUES (
     'YOUR_USER_ID',  -- Replace with your actual user ID
     'david.fletes@ctg-gmp.com',
     'David Fletes',
     'super_admin'
   );
   ```

5. **Click Run** (or Cmd/Ctrl + Enter)

6. **Verify:**
   ```sql
   SELECT * FROM user_profiles
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```
   
   Should show your profile with `role = 'super_admin'`

---

### Method 2: Using Table Editor

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Get Your User ID:**
   - Go to **Authentication** → **Users**
   - Find your email: `david.fletes@ctg-gmp.com`
   - Copy the **UID** (the long UUID string)

3. **Go to Table Editor:**
   - Left sidebar → **Table Editor**
   - Click **`user_profiles`** table

4. **Click "Insert row"** (or the + button)

5. **Fill in the form:**
   - **id:** Paste your UID from step 2
   - **email:** `david.fletes@ctg-gmp.com`
   - **name:** `David Fletes`
   - **role:** `super_admin`
   - **reports_to_id:** (leave empty/null)
   - **created_at:** (auto-filled)
   - **updated_at:** (auto-filled)

6. **Click Save**

---

## 🎯 Quick SQL (All in One)

If you want to do it all at once, run this in SQL Editor:

```sql
-- Create your profile with super_admin role
INSERT INTO user_profiles (id, email, name, role)
SELECT 
  id,
  email,
  raw_user_meta_data->>'name' as name,
  'super_admin' as role
FROM auth.users
WHERE email = 'david.fletes@ctg-gmp.com'
ON CONFLICT (id) DO UPDATE
SET role = 'super_admin';
```

This will:
- ✅ Find your user in `auth.users`
- ✅ Create profile in `user_profiles`
- ✅ Set role to `super_admin`
- ✅ Update if profile already exists

---

## ✅ After Creating Profile

1. **Log out** of the app
2. **Log back in**
3. **Check dashboard** - you should see "Admin Panel" option
4. **Go to Admin Panel** → Users - you should see yourself listed

---

## 🔍 Verify It Worked

Run this SQL to check:

```sql
SELECT 
  up.id,
  up.email,
  up.name,
  up.role,
  au.email as auth_email
FROM user_profiles up
JOIN auth.users au ON au.id = up.id
WHERE up.email = 'david.fletes@ctg-gmp.com';
```

Should show:
- ✅ Your profile exists
- ✅ Role is `super_admin`
- ✅ Email matches

---

## 🆘 Troubleshooting

### "Duplicate key error"
- Profile already exists
- Use the UPDATE method instead:
  ```sql
  UPDATE user_profiles
  SET role = 'super_admin'
  WHERE email = 'david.fletes@ctg-gmp.com';
  ```

### "Permission denied"
- RLS policies might be blocking
- Run the SQL as the service role, or temporarily disable RLS:
  ```sql
  -- Only if needed, and re-enable after
  ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
  -- Run your INSERT
  ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
  ```

### "Still can't see Admin Panel"
- Make sure you logged out and back in
- Clear browser cache
- Check the role is exactly `super_admin` (not `admin`)

---

## 📋 Checklist

- [ ] Found your user ID from Authentication
- [ ] Created profile in `user_profiles` table
- [ ] Set role to `super_admin`
- [ ] Verified profile exists (SQL query)
- [ ] Logged out and back in
- [ ] See "Admin Panel" in dashboard

---

**Once your profile is created, you'll have full admin access!** 🎉
