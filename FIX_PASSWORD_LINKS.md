# Fix Password Reset Links Pointing to Localhost

## Problem
Password reset/invitation links are pointing to `localhost` instead of the production URL `https://ctgtimesheet.com`, causing "ERR_CONNECTION_REFUSED" errors.

## Solution

### 1. Set Environment Variable in Vercel

The code has been updated to prevent localhost URLs, but you should also set the environment variable correctly:

1. **Go to Vercel Dashboard:**
   - https://vercel.com
   - Select your project: `timesheet-app`

2. **Go to Settings → Environment Variables**

3. **Add or Update:**
   - **Name:** `NEXT_PUBLIC_SITE_URL`
   - **Value:** `https://ctgtimesheet.com`
   - **Environment:** Production (and optionally Preview/Development)

4. **Save and Redeploy:**
   - Go to Deployments
   - Click the three dots (⋯) on the latest deployment
   - Select "Redeploy"

### 2. Verify Supabase Redirect URLs

Make sure Supabase allows redirects to your production domain:

1. **Go to Supabase Dashboard:**
   - https://app.supabase.com
   - Select your project

2. **Go to Authentication → URL Configuration**

3. **Verify these URLs are in "Redirect URLs":**
   - `https://ctgtimesheet.com/**`
   - `https://www.ctgtimesheet.com/**`
   - `https://ctgtimesheet.com/login`
   - `https://ctgtimesheet.com/auth/callback`

4. **Verify Site URL:**
   - Should be set to: `https://ctgtimesheet.com`

### 3. Test the Fix

1. **Create a new user** in the admin panel
2. **Copy the invitation link** that appears
3. **Check the link** - it should start with `https://ctgtimesheet.com` (not `localhost`)
4. **Send the link** to the user
5. **User clicks link** - should work correctly

## Code Changes Made

The code now:
- Checks if `NEXT_PUBLIC_SITE_URL` contains "localhost"
- If it does, automatically uses `https://ctgtimesheet.com` instead
- This ensures links always point to production, even if the env var is misconfigured

## Safari "Resend Form" Warning

The landing page refresh warning is a browser cache issue. The code has been updated to prevent form resubmission warnings. If it persists:

1. **Clear browser cache:**
   - Safari: Cmd+Shift+Delete → Clear History
   - Or use Private/Incognito mode

2. **Hard refresh:**
   - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

The landing page doesn't have any forms, so this warning shouldn't appear after clearing cache.
