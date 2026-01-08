# Error 522 Diagnostic Checklist

Use this checklist to verify everything is working properly and diagnose the persistent Error 522 issue.

---

## 🔍 Step 1: Verify Deployment Status

### Check Cloudflare Pages Deployment

1. **Go to Cloudflare Dashboard:**
   - https://dash.cloudflare.com
   - Navigate to: **Pages** → **timesheet-app** → **Deployments**

2. **Check Latest Deployment:**
   - ✅ Is the latest deployment showing a **green checkmark** (success)?
   - ✅ What is the deployment time? (Should be recent if you just pushed)
   - ✅ Click on the latest deployment → **View build logs**
   - Look for any errors or warnings

3. **Check Build Logs:**
   ```
   Look for:
   - ✅ "Build completed successfully"
   - ✅ No errors about missing files
   - ✅ No timeout errors during build
   - ❌ Any red error messages
   ```

**If deployment failed:**
- Fix the errors shown in build logs
- Push again: `git add . && git commit -m "Fix build errors" && git push`

---

## 🔍 Step 2: Verify Code Changes Were Deployed

### Check if Timeout Code is in Production

1. **Check Deployment Hash:**
   - In Cloudflare → Deployments → Latest
   - Note the commit hash (e.g., `abc1234`)
   - Compare with your local git log:
     ```bash
     git log --oneline -5
     ```

2. **Verify Files Were Updated:**
   - The latest deployment should include:
     - ✅ `lib/timeout.ts` (new file)
     - ✅ `lib/supabase/middleware.ts` (updated with timeout)
     - ✅ `lib/auth.ts` (updated with timeout)
     - ✅ `app/dashboard/page.tsx` (updated with timeout)
     - ✅ `app/page.tsx` (updated with timeout)
     - ✅ `app/dashboard/timesheets/new/page.tsx` (updated with timeout)

**If code wasn't deployed:**
```bash
# Make sure you committed and pushed
git status                    # Check for uncommitted changes
git add .                     # Add all changes
git commit -m "Add timeout handling"  # Commit
git push                      # Push to GitHub
```

---

## 🔍 Step 3: Check Environment Variables

### Verify Cloudflare Environment Variables

1. **Go to Cloudflare Pages Settings:**
   - https://dash.cloudflare.com
   - **Pages** → **timesheet-app** → **Settings** → **Environment Variables**

2. **Verify These Variables Are Set (Production):**
   - ✅ `NEXT_PUBLIC_SUPABASE_URL` - Should be your Supabase project URL
   - ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Should be your Supabase anon key
   - ✅ `NEXT_PUBLIC_SITE_URL` - Should be `https://ctgtimesheet.com`

3. **Check Variable Values:**
   - Click on each variable to verify it's set correctly
   - Make sure they're set for **Production** environment (not just Preview)

**If variables are missing:**
- Add them in Cloudflare Pages → Settings → Environment Variables
- Make sure to set them for **Production**
- Redeploy: Go to Deployments → Latest → Three dots → Retry deployment

---

## 🔍 Step 4: Test Supabase Connection

### Verify Database is Accessible

1. **Check Supabase Dashboard:**
   - https://app.supabase.com
   - Go to your project
   - Check **Status** - should show "Healthy"

2. **Test Connection from Your Laptop:**
   ```bash
   # In your project directory, test the connection
   npm run dev
   # Open http://localhost:3000
   # Try to log in
   # Does it work locally?
   ```

3. **Check Supabase Logs:**
   - Supabase Dashboard → **Logs** → **API Logs**
   - Look for recent requests
   - Check for any errors or timeouts

**If Supabase is down or slow:**
- Check Supabase status: https://status.supabase.com
- Check your Supabase project usage/limits
- Consider upgrading Supabase plan if hitting limits

---

## 🔍 Step 5: Check Cloudflare Function Logs

### View Runtime Errors

1. **Go to Cloudflare Pages:**
   - **Pages** → **timesheet-app** → **Functions** tab

2. **Check Function Logs:**
   - Look for recent invocations
   - Check for errors or timeouts
   - Look for any 522 errors in the logs

3. **Check Real-time Logs:**
   - Try accessing the site while watching logs
   - See what happens when the error occurs

**If you see errors in logs:**
- Note the error message
- Check if it's a timeout, database error, or other issue
- Fix the underlying problem

---

## 🔍 Step 6: Test Specific Pages

### Test Each Page Individually

Try accessing these URLs directly:

1. **Home Page:**
   - https://ctgtimesheet.com/
   - Should load (even if slow)

2. **Login Page:**
   - https://ctgtimesheet.com/login
   - Should load quickly (client-side page)

3. **Dashboard:**
   - https://ctgtimesheet.com/dashboard
   - This is where timeout might occur (has database queries)

4. **Timesheets List:**
   - https://ctgtimesheet.com/dashboard/timesheets
   - Another page with database queries

**Note which pages work and which timeout:**
- If home page works but dashboard times out → Database query issue
- If all pages timeout → Middleware or Supabase connection issue
- If login works but dashboard doesn't → Auth query issue

---

## 🔍 Step 7: Check DNS and Network

### Verify Domain Configuration

1. **Check DNS Records:**
   - Cloudflare → **DNS** → Records for `ctgtimesheet.com`
   - ✅ `ctgtimesheet.com` CNAME → `timesheet-app-90l.pages.dev` (Proxied)
   - ✅ `www` CNAME → `timesheet-app-90l.pages.dev` (Proxied)
   - Both should show **orange cloud** (Proxied)

2. **Test Direct Pages URL:**
   - Try: https://timesheet-app-90l.pages.dev
   - Does this work? (Bypasses custom domain)
   - If Pages URL works but custom domain doesn't → DNS issue

3. **Check SSL Certificate:**
   - Visit https://ctgtimesheet.com
   - Click the lock icon in browser
   - Verify SSL certificate is valid

---

## 🔍 Step 8: Verify Timeout Implementation

### Check if Timeouts Are Actually Working

1. **Check Middleware:**
   - File: `lib/supabase/middleware.ts`
   - Should have timeout on `supabase.auth.getUser()` (5 seconds)
   - Should catch errors and allow requests through

2. **Check Auth Function:**
   - File: `lib/auth.ts`
   - Should use `withTimeout()` for both auth and profile queries
   - Should have 5-second timeouts

3. **Check Pages:**
   - All dashboard pages should have `export const maxDuration = 10`
   - All database queries should use `withQueryTimeout()`

**If timeout code is missing:**
- Make sure you committed the changes
- Make sure you pushed to GitHub
- Wait for Cloudflare to rebuild

---

## 🔍 Step 9: Test Build Locally

### Verify Code Builds Correctly

```bash
# In your project directory
npm run build

# Check for:
# ✅ Build completes successfully
# ✅ No TypeScript errors
# ✅ No missing dependencies
# ❌ Any errors or warnings
```

**If build fails locally:**
- Fix the errors
- Test again with `npm run build`
- Once it builds locally, push to GitHub

---

## 🔍 Step 10: Check Cloudflare Workers Limits

### Verify You're Not Hitting Limits

1. **Check Cloudflare Plan:**
   - Free plan: 10 seconds max execution time
   - Paid plans: Up to 30 seconds

2. **Check Function Usage:**
   - Cloudflare Dashboard → **Workers & Pages** → Usage
   - Check if you're hitting any limits

3. **Check Request Rate:**
   - Are you making too many requests?
   - Free plan has request limits

---

## 🚨 Common Issues and Solutions

### Issue: Code Changes Not Deployed
**Solution:**
```bash
git status
git add .
git commit -m "Your changes"
git push
# Wait 2-5 minutes for Cloudflare to rebuild
```

### Issue: Environment Variables Missing
**Solution:**
- Go to Cloudflare Pages → Settings → Environment Variables
- Add missing variables
- Retry deployment

### Issue: Supabase Connection Slow
**Solution:**
- Check Supabase dashboard for issues
- Check Supabase status page
- Consider database connection pooling
- Check if queries are optimized (indexes)

### Issue: Middleware Timing Out
**Solution:**
- The timeout code should handle this
- If still timing out, Supabase might be completely down
- Check Supabase status

### Issue: Build Fails
**Solution:**
- Check build logs in Cloudflare
- Fix errors locally first
- Test with `npm run build`
- Push fixed code

---

## 📊 Diagnostic Report Template

Fill this out to help diagnose:

```
Date: ___________
Time: ___________

1. Latest Deployment Status: [ ] Success [ ] Failed
   Deployment Time: ___________
   Commit Hash: ___________

2. Environment Variables: [ ] All Set [ ] Missing
   Missing: ___________

3. Supabase Status: [ ] Healthy [ ] Issues
   Issues: ___________

4. Pages That Work:
   - [ ] Home page (/)
   - [ ] Login page (/login)
   - [ ] Dashboard (/dashboard)
   - [ ] Other: ___________

5. Pages That Timeout:
   - [ ] Home page (/)
   - [ ] Login page (/login)
   - [ ] Dashboard (/dashboard)
   - [ ] Other: ___________

6. Local Testing:
   - [ ] Works locally
   - [ ] Also times out locally
   - [ ] Haven't tested

7. Error Details:
   - Error Code: ___________
   - Error Message: ___________
   - When it happens: ___________

8. Recent Changes:
   - What did you change? ___________
   - When? ___________
```

---

## 🎯 Next Steps

After completing diagnostics:

1. **If code wasn't deployed:**
   - Commit and push your changes
   - Wait for Cloudflare to rebuild

2. **If environment variables missing:**
   - Add them in Cloudflare
   - Retry deployment

3. **If Supabase is slow/down:**
   - Check Supabase status
   - Consider upgrading plan
   - Optimize database queries

4. **If specific pages timeout:**
   - Check those pages for missing timeout handling
   - Add timeout wrappers to queries

5. **If all pages timeout:**
   - Check middleware timeout
   - Check Supabase connection
   - Check Cloudflare Workers limits

---

**Remember:** Error 522 means Cloudflare can't connect to your origin (Cloudflare Workers). The timeout code should help, but if Supabase is completely down or very slow, you may still see errors.
