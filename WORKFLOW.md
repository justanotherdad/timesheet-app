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

### 3. **Deploy to Vercel (When Ready)**

Once your changes are tested and ready:

```bash
# 1. Check what files changed
git status

# 2. Add your changes
git add .

# 3. Commit with a message
git commit -m "remove Audit Trail"

# 4. Push to GitHub
git push
```

**That's it!** Vercel will automatically:
- ✅ Detect the push to GitHub
- ✅ Build your application
- ✅ Deploy to `ctgtimesheet.com`
- ✅ Usually takes 2-3 minutes

**Check deployment status:**
- Go to: https://vercel.com/dashboard → `timesheet-app` → Deployments
- You'll see the build progress and status
- Green checkmark = Success ✅

---

## 📋 Quick Reference

### Work Offline
```bash
# Just edit files - nothing to run
# Your editor handles everything
```

### Test Changes
```bash
# 1. Open Terminal (Cmd + Space, type "Terminal")

# 2. Navigate to project
cd "/Users/davefletes/Library/Mobile Documents/com~apple~CloudDocs/Buisness/DJ2/Applications/TIMESHEET APPLICATION - CTG"

# 3. Start dev server
npm run dev

# 4. (Server starts - you see "Ready" message)
#    Open browser to http://localhost:3000
#    Make changes, test, etc.

# 5. When done testing, press Ctrl+C in Terminal
#    (Server stops, resources freed)
```

### Deploy Changes
```bash
# 1. Stage all changed files
git add .

# 2. Commit with a short message describing the change
git commit -m "timesheet confirmation"

# 3. Push to GitHub (triggers Vercel deployment)
git push
```
After pushing, Vercel will build and deploy; usually 2–3 minutes.

---

## Bid Sheet → Project Flow

1. **Create bid sheet** – Choose client (site), name it.
2. **Import CSV** – Columns: System_Name, System_Number, Deliverable_Name, Activity_Name, Budgeted_Hours. Systems, deliverables, and activities are created locally for that bid sheet (no site-level setup needed).
3. **Convert to project** – Creates a Project PO, creates site-level systems/deliverables/activities (or reuses by name), links them to the PO via `*_purchase_orders`, and populates `project_details`. The PO acts as a "timesheet options folder" for that project.
4. **Deactivate when done** – From Budget Detail, click **Deactivate** on the PO. This sets `purchase_orders.active = false`. Inactive POs and their systems/deliverables/activities are excluded from timesheet dropdowns. Click **Reactivate** to bring them back.

5. **Clone from converted bid sheets** – You can clone from any bid sheet (draft or converted), including those whose project PO is deactivated. Use **Create Bid Sheet → More → Clone from existing** to reuse systems, deliverables, activities, and hours from a past bid.

6. **Delete bid sheet** – Deleting a bid sheet removes its data (matrix, labor, indirect costs). If the bid sheet was converted, the project PO and its budget remain; only the bid sheet record is removed.

---

## Deactivate / Archive

### Purchase Orders
- **Deactivate** from Budget Detail (Deactivate button on a PO). Archived POs are removed from timesheet dropdowns but remain accessible to admins.
- **Budget selector**: By default only active POs are shown. Check "Show archived POs" to include archived when selecting a budget.
- **Reactivate** to bring a PO back to the active list.

### Employees (Users)
- **Deactivate** from Manage Users (Edit user → Deactivate). Deactivated users cannot log in; admins can still view and manage them.
- **Filter**: Status dropdown (Active / Archived / All) in the user list.
- **Reactivate** to restore access; they regain access to their history (unless the profile was fully deleted).

---

## 🔍 Verify Deployment

After pushing:

1. **Check Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Click `timesheet-app` → Deployments tab
   - Look for green checkmark ✅
   - Usually takes 2-3 minutes

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
1. Check Vercel Dashboard → Deployments → Latest → Build Logs
2. Look for error messages
3. Fix the issue locally
4. Test with `npm run build` (builds without starting server)
5. Push again

**Common Build Errors:**
- **Missing package:** Run `npm install <package-name>` locally, then commit `package.json`
- **TypeScript errors:** Check error message for file and line number, fix type issues
- **Environment variable issues:** Make sure all required vars are set in Vercel

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

**Required Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `NEXT_PUBLIC_SITE_URL` - Your site URL (e.g., https://ctgtimesheet.com)

**Where to Set:**
- Local testing: Create `.env.local` file in project root
- Production: Vercel Dashboard → Settings → Environment Variables
- **Important:** After adding/changing env vars in Vercel, you may need to redeploy

### Database Connection
- Local dev connects to your Supabase project
- Production connects to the same Supabase project
- No database changes needed between environments

### Session / idle logout (dashboard)

- The dashboard layout uses **`AutoLogout`** (`components/AutoLogout.tsx`): after **one hour** of no mouse, keyboard, scroll, or touch activity, the client signs out via Supabase and redirects to `/login`. Timer resets on activity. To change duration, edit `timeoutMinutes` on `<AutoLogout />` in `app/dashboard/layout.tsx` (default prop in `AutoLogout.tsx` should stay in sync for clarity).

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

- **Vercel Dashboard:** https://vercel.com/dashboard
- **GitHub Repository:** https://github.com/justanotherdad/timesheet-app
- **Live Site:** https://ctgtimesheet.com
- **Supabase Dashboard:** https://app.supabase.com

---

## 📖 Related documentation

- **JOB_AID.md** – How to use the site (employees through admins): timesheets, approvals, manage users, timesheet POs from **Bill Rates by Person** on each PO budget (not from user site/PO pickers), activities/deliverables/systems filtered by those POs’ sites, single Supervisor field in edit user, approval chain (Supervisor → Manager → Final Approver; skip none).
- **Access Levels.md** – Role-based access; My Timesheets (own only for non-admins); Pending Approvals / Approved Timesheets; bill-rate–driven timesheet dropdowns; `user_sites` for org/bid sheets; Budget Balance API / billable labor aggregation (service-role where needed).

---

**Remember:** Work offline, test when needed, deploy when ready! 🎉
