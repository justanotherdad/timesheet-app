# Fix: Missing Supabase Admin Environment Variables

## Error Message
```
Server configuration error: Missing Supabase admin environment variables
```

This error means the `SUPABASE_SERVICE_ROLE_KEY` is not set in your Vercel deployment.

## Solution: Add Environment Variable to Vercel

### Step 1: Get Your Supabase Service Role Key

1. Go to **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Go to **Settings** (gear icon in left sidebar)
4. Click on **API** in the settings menu
5. Scroll down to find **Project API keys**
6. Find the **`service_role`** key (it's marked as "secret" - this is important!)
7. Click the **eye icon** to reveal it
8. **Copy the entire key** (it's a long string starting with `eyJ...`)

⚠️ **IMPORTANT**: This is a secret key - never commit it to git or expose it publicly!

### Step 2: Add Environment Variable to Vercel

1. Go to **Vercel Dashboard**: https://vercel.com/dashboard
2. Select your project (the timesheet app)
3. Click on **Settings** (top navigation)
4. Click on **Environment Variables** (left sidebar)
5. Click **Add New** button

6. Fill in the form:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: (paste the service_role key you copied from Supabase)
   - **Environment**: 
     - ✅ Check **Production**
     - ✅ Check **Preview**
     - ✅ Check **Development** (optional, for local dev)
   - Click **Save**

### Step 3: Redeploy Your Application

After adding the environment variable, you need to redeploy:

**Option A: Automatic Redeploy (Recommended)**
1. Make any small change (or just push the current code again):
   ```bash
   git add .
   git commit -m "Trigger redeploy with env vars"
   git push
   ```
2. Vercel will automatically redeploy with the new environment variables

**Option B: Manual Redeploy**
1. Go to Vercel Dashboard → Your Project
2. Click on the **Deployments** tab
3. Find the most recent deployment
4. Click the **three dots (⋯)** menu
5. Click **Redeploy**
6. Confirm the redeploy

### Step 4: Verify It's Working

1. Wait for the redeploy to complete (usually 1-2 minutes)
2. Go to your app: https://ctgtimesheet.com (or your Vercel URL)
3. Log in as an admin
4. Go to **Admin Panel** → **Users**
5. Click **+ Add User**
6. Fill in the form and click **Add User**
7. The user should be created successfully!

## Verify Environment Variables Are Set

To check if your environment variables are set in Vercel:

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. You should see:
   - `NEXT_PUBLIC_SUPABASE_URL` ✅
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅
   - `SUPABASE_SERVICE_ROLE_KEY` ✅ (this is the one you just added)

## Troubleshooting

### Still Getting the Error?

1. **Make sure you redeployed** after adding the variable
   - Environment variables are only loaded when the app is deployed
   - Old deployments don't have the new variables

2. **Check the variable name is exact:**
   - Must be exactly: `SUPABASE_SERVICE_ROLE_KEY`
   - Case-sensitive, no spaces

3. **Check all environments are selected:**
   - Production ✅
   - Preview ✅
   - Development ✅ (if you want local dev to work)

4. **Verify the key is correct:**
   - Copy the entire key from Supabase
   - Make sure there are no extra spaces before/after
   - The key should start with `eyJ` (it's a JWT token)

5. **Check Vercel build logs:**
   - Go to Vercel Dashboard → Your Project → **Deployments**
   - Click on the latest deployment
   - Check the **Build Logs** for any errors
   - Look for messages about missing environment variables

### Local Development

If you want to test locally, also add it to your `.env.local` file:

```bash
# .env.local (in your project root)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then restart your dev server:
```bash
npm run dev
```

---

## Why Do We Need This?

The `SUPABASE_SERVICE_ROLE_KEY` is required because:
- Creating new users in Supabase Auth requires admin privileges
- Only the service role key has these privileges
- Regular user tokens (anon key) cannot create users
- This is a security feature to prevent unauthorized user creation

This key bypasses Row Level Security (RLS) and should **only** be used in server-side code (which we're doing - the `create-user` server action runs on the server).
