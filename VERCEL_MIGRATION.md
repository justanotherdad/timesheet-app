# Quick Migration Guide: Cloudflare → Vercel

This guide will help you migrate from Cloudflare Pages to Vercel in about 30 minutes.

---

## Why Vercel?

- ✅ **Better timeout handling:** 60 seconds vs 10 seconds (Cloudflare free tier)
- ✅ **Made for Next.js:** Created by Next.js team, better integration
- ✅ **Same free tier:** No cost increase
- ✅ **Easier deployment:** Automatic from GitHub
- ✅ **Better error messages:** Easier to debug

---

## Step 1: Create Vercel Account (5 minutes)

1. Go to: https://vercel.com
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (easiest)
4. Authorize Vercel to access your GitHub

---

## Step 2: Import Your Project (5 minutes)

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Find your repository: `justanotherdad/timesheet-app`
3. Click **"Import"**

---

## Step 3: Configure Build Settings (2 minutes)

Vercel should auto-detect Next.js, but verify:

- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (auto-filled)
- **Output Directory:** `.next` (auto-filled)
- **Install Command:** `npm install` (auto-filled)
- **Root Directory:** `./` (leave as is)

---

## Step 4: Add Environment Variables (5 minutes)

**Critical step!** Add these in Vercel:

1. In project settings, go to **"Environment Variables"**
2. Add these three variables:

```
NEXT_PUBLIC_SUPABASE_URL
= (your Supabase project URL)
= Production, Preview, Development (check all)

NEXT_PUBLIC_SUPABASE_ANON_KEY
= (your Supabase anon key)
= Production, Preview, Development (check all)

NEXT_PUBLIC_SITE_URL
= https://ctgtimesheet.com
= Production only
```

**Where to find Supabase values:**
- Go to: https://app.supabase.com
- Your project → Settings → API
- Copy "Project URL" and "anon public" key

---

## Step 5: Deploy (5 minutes)

1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. You'll get a URL like: `timesheet-app-abc123.vercel.app`
4. Test this URL - does it work?

---

## Step 6: Connect Custom Domain (10 minutes)

### Option A: Use Vercel's DNS (Easiest)

1. In Vercel project → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `ctgtimesheet.com`
4. Follow instructions to update DNS

### Option B: Keep Cloudflare DNS (Current Setup)

1. In Vercel project → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter: `ctgtimesheet.com`
4. Vercel will show DNS records to add
5. Go to Cloudflare → **DNS** → **Records**
6. Update CNAME:
   - **Name:** `ctgtimesheet.com`
   - **Target:** `cname.vercel-dns.com` (or what Vercel shows)
   - **Proxy status:** Proxied (orange cloud)
7. Wait 5-10 minutes for DNS propagation

---

## Step 7: Test Everything (5 minutes)

1. Visit: https://ctgtimesheet.com
2. Test login
3. Test creating timesheet
4. Test dashboard
5. Check for any errors

---

## Step 8: Update Supabase Redirect URLs (2 minutes)

1. Go to: https://app.supabase.com
2. Your project → **Authentication** → **URL Configuration**
3. Add to **Redirect URLs:**
   - `https://ctgtimesheet.com/**`
   - `https://www.ctgtimesheet.com/**`
   - `https://timesheet-app-*.vercel.app/**` (for preview deployments)
4. Update **Site URL:** `https://ctgtimesheet.com`

---

## ✅ Verification Checklist

- [ ] Vercel deployment successful (green checkmark)
- [ ] Environment variables set correctly
- [ ] Custom domain connected
- [ ] Site loads at https://ctgtimesheet.com
- [ ] Login works
- [ ] Dashboard loads
- [ ] No Error 522
- [ ] Supabase redirect URLs updated

---

## 🔄 Rollback Plan

If Vercel doesn't work:

1. **Keep Cloudflare as backup:**
   - Don't delete Cloudflare project
   - Just point DNS back to Cloudflare if needed

2. **Switch DNS back:**
   - Cloudflare → DNS → Records
   - Change CNAME back to `timesheet-app-90l.pages.dev`

---

## 🆘 Troubleshooting

### "Build Failed"
- Check build logs in Vercel
- Verify environment variables are set
- Check for TypeScript errors locally: `npm run build`

### "Domain Not Working"
- Wait 10-15 minutes for DNS propagation
- Check DNS records match Vercel's instructions
- Verify SSL certificate is issued (can take a few minutes)

### "Still Getting Errors"
- Check Vercel function logs
- Verify Supabase connection
- Test the Vercel preview URL first (before custom domain)

### "Environment Variables Not Working"
- Make sure they're set for **Production** environment
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)

---

## 📊 What Changes?

**What stays the same:**
- ✅ All your code
- ✅ GitHub repository
- ✅ Supabase database
- ✅ Domain name
- ✅ Everything else

**What changes:**
- 🔄 Hosting provider (Cloudflare → Vercel)
- 🔄 Deployment URL (different preview URLs)
- 🔄 DNS settings (if you change them)

---

## 💰 Cost Comparison

| Feature | Cloudflare Pages | Vercel |
|---------|-----------------|--------|
| Free Tier | ✅ Yes | ✅ Yes |
| Build Time | 2-5 min | 2-3 min |
| Timeout Limit | 10 sec (free) | 60 sec (free) |
| Next.js Integration | Good | Excellent |
| Custom Domain | ✅ Free | ✅ Free |
| SSL Certificate | ✅ Free | ✅ Free |

**Cost:** Same (both free for your use case)

---

## 🎯 Expected Results

After migration:
- ✅ No more Error 522 (better timeout handling)
- ✅ Faster deployments
- ✅ Better error messages
- ✅ Same functionality
- ✅ Same cost (free)

---

## 📞 Need Help?

**Vercel Support:**
- Dashboard has built-in support chat
- Documentation: https://vercel.com/docs

**Common Issues:**
- Check Vercel deployment logs
- Check function logs
- Verify environment variables

---

**Time estimate:** 30 minutes total
**Difficulty:** Easy
**Risk:** Low (can rollback easily)

**Recommendation:** This is the easiest fix for your Error 522 issue while keeping all your code and functionality the same.
