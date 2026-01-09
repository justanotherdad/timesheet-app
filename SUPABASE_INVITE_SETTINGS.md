# Supabase Settings for Invitation Links

## Required Supabase Settings

### 1. Authentication → URL Configuration

**Location:** Supabase Dashboard → Authentication → URL Configuration

**Required Settings:**

1. **Site URL:**
   - Set to: `https://ctgtimesheet.com`
   - This is the base URL for your application

2. **Redirect URLs:**
   Add ALL of these URLs (one per line):
   ```
   https://ctgtimesheet.com/**
   https://ctgtimesheet.com/auth/setup-password
   https://ctgtimesheet.com/auth/callback
   https://ctgtimesheet.com/auth/callback?next=/auth/setup-password
   https://www.ctgtimesheet.com/**
   http://localhost:3000/**
   http://localhost:3000/auth/setup-password
   ```

   **Important:** The `**` wildcard allows any path under that domain.

### 2. Authentication → Email Templates

**Location:** Supabase Dashboard → Authentication → Email Templates

**Check These Settings:**

1. **Confirm signup** - Should be enabled
2. **Invite user** - Should be enabled (even though we're not using email delivery)
3. **Magic Link** - Can be enabled or disabled (we're not using it)

**Note:** Even though we're copying links manually, Supabase still needs these templates configured.

### 3. Authentication → Providers

**Location:** Supabase Dashboard → Authentication → Providers

**Email Provider Settings:**

1. **Enable Email Provider:**
   - Make sure "Email" provider is enabled
   - This is required for invite links to work

2. **Confirm email:**
   - For invite links, you can set this to "Auto Confirm" or "Send confirmation email"
   - Since we're using `email_confirm: false` in code, the invite link will confirm it

3. **Secure email change:**
   - Can be enabled or disabled (not critical for invites)

### 4. Project Settings → API

**Location:** Supabase Dashboard → Project Settings → API

**Verify:**

1. **Project URL:** Should match your Supabase project URL
2. **API Keys:** Make sure you have:
   - `anon` key (public) - Used in `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secret) - Used in `SUPABASE_SERVICE_ROLE_KEY`

## Common Issues and Fixes

### Issue: "Invalid or expired invitation link"

**Possible Causes:**

1. **Redirect URL not in allowed list:**
   - Fix: Add the exact redirect URL to "Redirect URLs" in Supabase
   - The URL must match EXACTLY what's in the `redirectTo` option

2. **Site URL mismatch:**
   - Fix: Ensure Site URL in Supabase matches your production domain
   - Check: `https://ctgtimesheet.com` (no trailing slash)

3. **Link expired:**
   - Supabase invite links expire after a certain time (usually 24 hours)
   - Fix: Generate a new link

4. **Email not confirmed:**
   - If `email_confirm: false`, the invite link must be used to confirm
   - Fix: Make sure the link is clicked by the actual user (not a preview bot)

### Issue: "Auth session missing"

**Possible Causes:**

1. **Cookies not being set:**
   - Fix: Check browser console for cookie errors
   - Ensure cookies are enabled in browser

2. **Domain mismatch:**
   - Fix: Ensure the domain in the link matches the domain where cookies are set
   - Check: Both should be `ctgtimesheet.com`

## Testing the Setup

1. **Create a test user:**
   - Go to Admin Panel → Users → Add User
   - Copy the invitation link

2. **Check the link format:**
   - Should start with: `https://[your-supabase-project].supabase.co/auth/v1/verify?token=...`
   - Should include: `redirect_to=https://ctgtimesheet.com/auth/setup-password`

3. **Test the link:**
   - Open in incognito/private window
   - Click the link
   - Should redirect to `/auth/setup-password`
   - Should show password setup form (not error)

## Debugging Steps

1. **Check Supabase Logs:**
   - Go to: Supabase Dashboard → Logs → API Logs
   - Look for errors when clicking the invite link

2. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Click the invite link
   - Look for any errors or warnings

3. **Check Network Tab:**
   - Open browser DevTools → Network tab
   - Click the invite link
   - Look for failed requests or 4xx/5xx errors

4. **Verify Environment Variables:**
   - In Vercel: Settings → Environment Variables
   - Ensure `NEXT_PUBLIC_SITE_URL` = `https://ctgtimesheet.com`
   - Ensure `NEXT_PUBLIC_SUPABASE_URL` is correct
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set

## Quick Checklist

- [ ] Site URL set to `https://ctgtimesheet.com` in Supabase
- [ ] Redirect URLs include `https://ctgtimesheet.com/**`
- [ ] Email provider is enabled
- [ ] `NEXT_PUBLIC_SITE_URL` environment variable is set in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` environment variable is set in Vercel
- [ ] Link is clicked directly (not via preview)
- [ ] Link is used within expiration time (usually 24 hours)
- [ ] Browser allows cookies
- [ ] No ad blockers interfering
