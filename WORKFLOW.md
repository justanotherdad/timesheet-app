# Development Workflow Guide

## Offline Development → Test → Deploy

This guide shows you how to work offline without using laptop resources, then test and deploy when ready.

---

## 🖥️ Daily Workflow

### 1. **Work Offline (No Dev Server)**

**Just edit files normally:**
- Open files in your editor (VS Code, Cursor, etc.)
- Make changes to code
- Save files
- **No terminal commands needed**
- **No resources being used**

Your editor will still provide:
- ✅ Syntax highlighting
- ✅ TypeScript type checking (lightweight)
- ✅ Code completion
- ✅ Error detection

**What NOT to run:**
- ❌ `npm run dev` (dev server - uses lots of resources)
- ❌ Any terminal commands

---

### 2. **Test Locally (When Ready)**

When you want to test your changes:

```bash
# Start dev server (only when testing)
npm run dev
```

**Then:**
- Open browser to `http://localhost:3000`
- Test your changes
- Make any fixes needed

**When done testing:**
```bash
# Stop the dev server (Ctrl+C in terminal)
# This frees up all resources
```

---

### 3. **Deploy to Cloudflare (When Ready)**

Once your changes are tested and ready:

```bash
# 1. Check what files changed
git status

# 2. Add your changes
git add .

# 3. Commit with a message
git commit -m "Description of your changes"

# 4. Push to GitHub
git push
```

**That's it!** Cloudflare Pages will automatically:
- ✅ Detect the push to GitHub
- ✅ Build your application
- ✅ Deploy to `ctgtimesheet.com`
- ✅ Usually takes 2-5 minutes

**Check deployment status:**
- Go to: https://dash.cloudflare.com → Pages → `timesheet-app` → Deployments
- You'll see the build progress and status

---

## 📋 Quick Reference

### Work Offline
```bash
# Just edit files - nothing to run
# Your editor handles everything
```

### Test Changes
```bash
npm run dev          # Start server
# Test in browser at http://localhost:3000
# Press Ctrl+C to stop when done
```

### Deploy Changes
```bash
git add .
git commit -m "Your change description"
git push
# Cloudflare auto-deploys in 2-5 minutes
```

---

## 🔍 Verify Deployment

After pushing:

1. **Check Cloudflare Dashboard:**
   - https://dash.cloudflare.com
   - Pages → `timesheet-app` → Deployments
   - Look for green checkmark ✅

2. **Check Your Site:**
   - Visit https://ctgtimesheet.com
   - Test your changes
   - Hard refresh (Cmd+Shift+R) to clear cache

---

## 💡 Tips

### Only Run Dev Server When Testing
- **Don't** leave `npm run dev` running all day
- **Do** start it only when you need to test
- **Do** stop it (Ctrl+C) when done testing

### Git Best Practices
- Commit frequently with clear messages
- Push when changes are ready
- Each push triggers a new deployment

### If Build Fails
1. Check Cloudflare → Deployments → Latest build logs
2. Look for error messages
3. Fix the issue locally
4. Test with `npm run build` (builds without starting server)
5. Push again

---

## 🚀 Example Session

**Morning - Making Changes:**
```bash
# 1. Edit files in your editor (no commands needed)
# 2. Save files
# 3. Continue editing...
```

**Afternoon - Testing:**
```bash
# 1. Start dev server
npm run dev

# 2. Test in browser
# 3. Fix any issues
# 4. Stop server (Ctrl+C)
```

**Evening - Deploying:**
```bash
# 1. Review changes
git status

# 2. Commit
git add .
git commit -m "Added timeout handling for database queries"

# 3. Deploy
git push

# 4. Wait 2-5 minutes, then check site
```

---

## ⚠️ Important Notes

### Environment Variables
- Local testing uses `.env.local` (if you have one)
- Production uses Cloudflare Pages environment variables
- Make sure Cloudflare has all required env vars set

### Database Connection
- Local dev connects to your Supabase project
- Production connects to the same Supabase project
- No database changes needed between environments

### Build Time
- First build: ~3-5 minutes
- Subsequent builds: ~2-3 minutes
- Cloudflare caches dependencies for faster builds

---

## 🆘 Troubleshooting

### "Changes not showing on site"
- Hard refresh browser (Cmd+Shift+R)
- Check Cloudflare deployment status
- Wait a few minutes for DNS propagation

### "Build failed"
- Check build logs in Cloudflare dashboard
- Run `npm run build` locally to test
- Fix errors, then push again

### "Dev server won't start"
- Make sure you're in the project directory
- Run `npm install` if dependencies are missing
- Check for port 3000 conflicts

---

## 📞 Quick Links

- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **GitHub Repository:** https://github.com/justanotherdad/timesheet-app
- **Live Site:** https://ctgtimesheet.com
- **Supabase Dashboard:** https://app.supabase.com

---

**Remember:** Work offline, test when needed, deploy when ready! 🎉
