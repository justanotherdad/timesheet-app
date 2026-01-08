# Deployment Guide - Vercel

Now that you're using Vercel, deployments are **automatic** when you push to GitHub!

---

## 🚀 How to Deploy Changes

### Step 1: Make Your Changes

Edit files in your editor (no dev server needed):
- Make code changes
- Save files
- **No terminal commands needed**

---

### Step 2: Commit and Push to GitHub

```bash
# 1. Check what changed
git status

# 2. Add your changes
git add .

# 3. Commit with a message
git commit -m "Description of your changes"

# 4. Push to GitHub
git push
```

**That's it!** Vercel automatically:
- ✅ Detects the push
- ✅ Builds your application
- ✅ Deploys to production
- ✅ Usually takes 2-3 minutes

---

## 📊 Check Deployment Status

### In Vercel Dashboard:

1. Go to: https://vercel.com/dashboard
2. Click on your project: **timesheet-app**
3. Go to **Deployments** tab
4. You'll see:
   - Latest deployment with status (building, ready, error)
   - Build logs
   - Deployment URL

### What to Look For:

- ✅ **Green checkmark** = Success
- ⏳ **Spinning icon** = Building
- ❌ **Red X** = Failed (check logs)

---

## ⏱️ Deployment Timeline

1. **Push to GitHub** → Instant
2. **Vercel detects push** → 10-30 seconds
3. **Build starts** → Shows in dashboard
4. **Build completes** → 2-3 minutes
5. **Deploy to production** → 10-30 seconds
6. **Total time:** ~3-5 minutes

---

## 🔍 Verify Your Changes

After deployment completes:

1. **Visit your site:**
   - https://ctgtimesheet.com
   - Or the Vercel preview URL

2. **Test your changes:**
   - Make sure everything works
   - Check for any errors

3. **Hard refresh if needed:**
   - Mac: Cmd + Shift + R
   - Windows: Ctrl + Shift + R
   - Clears browser cache

---

## 🎯 Quick Reference

### Deploy Changes:
```bash
git add .
git commit -m "Your change description"
git push
# Wait 3-5 minutes, then check site
```

### Check Status:
- Vercel Dashboard → Deployments → Latest

### View Logs:
- Vercel Dashboard → Deployments → Click deployment → Build Logs

---

## 🆘 Troubleshooting

### "Build Failed"

1. **Check build logs:**
   - Vercel Dashboard → Deployments → Latest → Build Logs
   - Look for red error messages

2. **Common issues:**
   - TypeScript errors
   - Missing dependencies
   - Environment variables not set

3. **Fix locally first:**
   ```bash
   npm run build
   # Fix any errors
   # Then push again
   ```

### "Changes Not Showing"

1. **Check deployment status:**
   - Make sure latest deployment is ✅ (green checkmark)

2. **Wait a bit longer:**
   - Sometimes takes 5-10 minutes

3. **Hard refresh browser:**
   - Cmd/Ctrl + Shift + R

4. **Check you pushed to correct branch:**
   - Vercel deploys from `main` branch by default
   - Make sure you pushed to `main`

### "Environment Variables Missing"

1. **Go to Vercel:**
   - Project → Settings → Environment Variables

2. **Add missing variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`

3. **Redeploy:**
   - Go to Deployments → Latest → Three dots → Redeploy

---

## 📋 Deployment Checklist

Before pushing:
- [ ] Code works locally (test with `npm run dev` if needed)
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Changes are saved

After pushing:
- [ ] Check Vercel dashboard for build status
- [ ] Wait for build to complete (2-5 minutes)
- [ ] Test site at https://ctgtimesheet.com
- [ ] Verify changes are live

---

## 🔄 Rollback (If Needed)

If a deployment breaks something:

1. **Go to Vercel Dashboard:**
   - Deployments tab
   - Find the last working deployment
   - Click three dots (⋯) → **Promote to Production**

2. **Or redeploy previous version:**
   - Click three dots → **Redeploy**

---

## 💡 Pro Tips

### Preview Deployments

- Every push creates a preview deployment
- You get a unique URL to test before production
- Great for testing changes safely

### Branch Deployments

- Push to different branches = separate deployments
- Test features without affecting production
- Merge to `main` when ready

### Automatic Deployments

- **Push to `main`** = Production deployment
- **Push to other branches** = Preview deployment
- **Pull Request** = Preview deployment

---

## 🎯 Summary

**Deploying is simple:**
1. Make changes
2. `git add . && git commit -m "..." && git push`
3. Wait 3-5 minutes
4. Check Vercel dashboard
5. Test your site

**No manual deployment steps needed!** Vercel handles everything automatically.

---

## 📞 Quick Links

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Your Project:** https://vercel.com/dashboard → timesheet-app
- **Live Site:** https://ctgtimesheet.com
- **GitHub Repo:** https://github.com/justanotherdad/timesheet-app

---

**Remember:** Just push to GitHub and Vercel does the rest! 🚀
