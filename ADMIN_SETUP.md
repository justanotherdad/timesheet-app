# Admin Setup Guide

This guide explains how to set up your first admin account and manage user access.

---

## 🎯 Step 1: Make Yourself an Admin

Since signup is now disabled, you need to manually set your role in the database.

### Option A: Using Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Go to Table Editor:**
   - Left sidebar → **Table Editor**
   - Find and click on **`user_profiles`** table

3. **Find Your User:**
   - Look for your email: `david.fletes@ctg-gmp.com`
   - Or search for your name: `David Fletes`

4. **Update Your Role:**
   - Click on the row to edit
   - Find the **`role`** column
   - Change it from `employee` to `super_admin`
   - Click **Save**

5. **Verify:**
   - Log out and log back in
   - You should now see the "Admin Panel" option in your dashboard

### Option B: Using SQL Editor (Alternative)

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Go to SQL Editor:**
   - Left sidebar → **SQL Editor**
   - Click **New Query**

3. **Run This SQL:**
   ```sql
   UPDATE user_profiles
   SET role = 'super_admin'
   WHERE email = 'david.fletes@ctg-gmp.com';
   ```

4. **Click Run** (or press Cmd/Ctrl + Enter)

5. **Verify:**
   - Log out and log back in
   - You should now see the "Admin Panel" option

---

## 👥 Step 2: Invite New Users (Admin Only)

Once you're an admin, you can invite users through the Admin Panel.

### Method 1: Create User Profile (They Sign Up Later)

1. **Go to Admin Panel:**
   - Dashboard → **Admin Panel** → **Users**

2. **Click "Add User"**

3. **Fill in the form:**
   - **Name:** User's full name
   - **Email:** User's email address
   - **Role:** Select their role (employee, supervisor, manager, admin)
   - **Reports To:** (Optional) Select their supervisor/manager

4. **Click "Add User"**

5. **Tell the user to sign up:**
   - They go to: https://ctgtimesheet.com/signup
   - They'll see a message that signup is disabled
   - **But wait!** We need to enable signup for invited users...

### Method 2: Use Invite Links (Recommended - Coming Soon)

We'll set up invite links so admins can send secure invitation emails.

**For now, use Method 1 and temporarily enable signup for new users.**

---

## 🔧 Step 3: Temporarily Enable Signup for New Users

Since we disabled public signup, you have two options:

### Option A: Enable Signup with Email Check

We can modify the signup page to only allow signup if the email exists in `user_profiles` table.

**This way:**
- ✅ Only invited users (emails in database) can sign up
- ✅ Public signup is blocked
- ✅ Users can create their own password

### Option B: Admin Creates Full Account

Admin creates the full account including password, then sends credentials to user.

**This way:**
- ✅ Full control
- ✅ No signup page needed
- ⚠️ Less secure (password sharing)

---

## 🎭 User Roles Explained

- **Employee:** Can create and submit timesheets
- **Supervisor:** Can approve timesheets from direct reports
- **Manager:** Can approve timesheets and manage POs
- **Admin:** Can manage users, sites, POs, and all settings
- **Super Admin:** Can change user roles (including making other admins)

---

## 📋 Quick Reference

### Make User an Admin:
```sql
UPDATE user_profiles
SET role = 'super_admin'
WHERE email = 'user@example.com';
```

### Make User a Regular Admin:
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'user@example.com';
```

### Check User's Current Role:
```sql
SELECT email, name, role
FROM user_profiles
WHERE email = 'user@example.com';
```

### List All Admins:
```sql
SELECT email, name, role
FROM user_profiles
WHERE role IN ('admin', 'super_admin')
ORDER BY name;
```

---

## 🆘 Troubleshooting

### "I don't see Admin Panel"
- Make sure you set your role to `admin` or `super_admin` in database
- Log out and log back in
- Clear browser cache

### "Can't update role in Supabase"
- Make sure you're in the correct project
- Check that the `user_profiles` table exists
- Verify the email matches exactly (case-sensitive)

### "User can't sign up"
- Signup is disabled for security
- Admin must create user profile first
- Then user can sign up (if we enable email-check signup)

---

## 🔐 Security Notes

- **Never share admin credentials**
- **Only super_admin can change roles**
- **Regular admin can manage users but not change roles**
- **All user actions are logged in Supabase**

---

## 📞 Next Steps

1. ✅ Make yourself `super_admin` (follow Step 1)
2. ✅ Test admin panel access
3. ✅ Create test users via Admin Panel
4. ⏳ Set up invite system (optional, for later)

**Once you're an admin, you can manage everything from the Admin Panel!**
