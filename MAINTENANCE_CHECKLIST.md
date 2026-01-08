# Timesheet App Maintenance Checklist

**Domain:** `ctgtimesheet.com`  
**Cloudflare Pages Project:** `timesheet-app`  
**GitHub Repository:** `justanotherdad/timesheet-app`  
**Last Updated:** 2026-01-08

---

## 🔴 Critical Checks (Fix Immediately if Broken)

### Environment Variables in Cloudflare Pages
- [ ] **Location:** Cloudflare Pages → `timesheet-app` → Settings → Environment Variables
- [ ] Verify `NEXT_PUBLIC_SUPABASE_URL` is set for Production
- [ ] Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set for Production
- [ ] Verify `NEXT_PUBLIC_SITE_URL` = `https://ctgtimesheet.com`
- [ ] **Action if missing:** Add/update in Cloudflare Pages settings

### Supabase Redirect URLs
- [ ] **Location:** Supabase Dashboard → Authentication → URL Configuration
- [ ] Verify `https://ctgtimesheet.com/**` is in Redirect URLs
- [ ] Verify `https://www.ctgtimesheet.com/**` is in Redirect URLs
- [ ] Verify Site URL = `https://ctgtimesheet.com`
- [ ] **Action if missing:** Add URLs in Supabase Auth settings

### DNS Records in Cloudflare
- [ ] **Location:** Cloudflare → DNS → Records for `ctgtimesheet.com`
- [ ] Verify `ctgtimesheet.com` CNAME → `timesheet-app-90l.pages.dev` (Proxied)
- [ ] Verify `www` CNAME → `timesheet-app-90l.pages.dev` (Proxied)
- [ ] Both should show orange cloud icon (Proxied)
- [ ] **Action if wrong:** Edit records to point to correct Pages URL

---

## 🟡 Weekly Checks

### Application Functionality
- [ ] Visit `https://ctgtimesheet.com` - app loads correctly
- [ ] Test login/signup functionality
- [ ] Test creating a timesheet
- [ ] Check for any error messages in browser console (F12)

### Deployment Status
- [ ] **Location:** Cloudflare Pages → `timesheet-app` → Deployments
- [ ] Verify latest deployment is successful (green checkmark)
- [ ] Check build logs for any warnings
- [ ] **Action if failed:** Review build logs and fix errors

---

## 🟢 Monthly Checks

### GitHub → Cloudflare Connection
- [ ] **Location:** Cloudflare Pages → Settings → Builds & deployments
- [ ] Verify "Production branch" = `main`
- [ ] Verify repository is connected: `justanotherdad/timesheet-app`
- [ ] Test: Make a small change, push to GitHub, verify new build starts
- [ ] **Action if broken:** Disconnect and reconnect GitHub repository

### Supabase Project Status
- [ ] **Location:** Supabase Dashboard → Project Settings
- [ ] Verify project is active (not paused)
- [ ] Check for any error notifications
- [ ] Review database usage/quota
- [ ] **Action if issues:** Check Supabase status page or support

### SSL Certificate
- [ ] **Location:** Cloudflare → SSL/TLS → Overview
- [ ] Verify certificate status = "Active"
- [ ] Verify SSL/TLS encryption mode = "Full" or "Full (strict)"
- [ ] Check certificate expiration date (usually auto-renewed)
- [ ] **Action if expired:** Contact Cloudflare support

### Environment Variables Review
- [ ] **Location:** Cloudflare Pages → Settings → Environment Variables
- [ ] Verify all 3 variables still exist
- [ ] Verify values haven't changed
- [ ] Check both Production and Preview environments
- [ ] **Action if changed:** Update with correct values

---

## 🔵 Quarterly Checks

### DNS Configuration
- [ ] **Location:** Cloudflare → DNS → Records
- [ ] Review all DNS records for `ctgtimesheet.com`
- [ ] Verify CNAME records are correct
- [ ] Remove any unused records
- [ ] Keep `_dmarc` TXT record for email security
- [ ] **Action if issues:** Update records as needed

### Nameservers in GoDaddy
- [ ] **Location:** GoDaddy → My Products → Domains → `ctgtimesheet.com` → DNS
- [ ] Verify nameservers point to Cloudflare:
  - Should be: `ns1.cloudflare.com` and `ns2.cloudflare.com` (or similar)
- [ ] **Action if wrong:** Update to Cloudflare nameservers

### Supabase Settings Review
- [ ] **Location:** Supabase Dashboard → Settings
- [ ] Review API settings (URL and keys)
- [ ] Review Authentication settings
- [ ] Check Row Level Security (RLS) policies are enabled
- [ ] Review database backups (if applicable)
- [ ] **Action if issues:** Update settings as needed

### GitHub Repository
- [ ] **Location:** GitHub → `justanotherdad/timesheet-app`
- [ ] Verify repository is accessible
- [ ] Check for any security alerts
- [ ] Review recent commits
- [ ] **Action if issues:** Address security alerts or access issues

---

## 🟣 Annual Checks

### Domain Renewal
- [ ] **Location:** GoDaddy → My Products → Domains
- [ ] Check `ctgtimesheet.com` renewal date
- [ ] Ensure auto-renewal is enabled
- [ ] **Action if expiring:** Renew domain before expiration

### Supabase Billing/Plan
- [ ] **Location:** Supabase Dashboard → Billing
- [ ] Review current plan and usage
- [ ] Check for any billing issues
- [ ] Review usage limits
- [ ] **Action if needed:** Upgrade plan or optimize usage

### Cloudflare Plan/Usage
- [ ] **Location:** Cloudflare Dashboard → Billing
- [ ] Review current plan (Free plan should be sufficient)
- [ ] Check usage statistics
- [ ] Review any usage limits
- [ ] **Action if needed:** Upgrade plan if required

### Security Review
- [ ] Review all API keys and secrets
- [ ] Rotate Supabase keys if needed (update in Cloudflare env vars)
- [ ] Review GitHub repository access permissions
- [ ] Check for any security vulnerabilities
- [ ] **Action if issues:** Update keys and fix vulnerabilities

---

## 📋 Quick Health Check (Run Monthly)

### 1. Test GitHub → Cloudflare Connection
```bash
# Make a small change
echo "// Health check $(date)" >> README.md
git add README.md
git commit -m "Health check - $(date +%Y-%m-%d)"
git push

# Then check Cloudflare Pages for new deployment
```

### 2. Test Domain
- [ ] Visit `https://ctgtimesheet.com` - should load app
- [ ] Visit `https://www.ctgtimesheet.com` - should load app
- [ ] Check browser shows valid SSL certificate (lock icon)

### 3. Test Supabase Connection
- [ ] Try logging in with test account
- [ ] Try signing up new account
- [ ] Create a test timesheet
- [ ] Check for any Supabase errors in browser console

### 4. Check Build Status
- [ ] Go to Cloudflare Pages → Deployments
- [ ] Verify latest build is successful
- [ ] Check build time (should be reasonable, < 5 minutes)

---

## 🚨 Emergency Contacts & Resources

### Cloudflare Support
- **Dashboard:** https://dash.cloudflare.com
- **Status Page:** https://www.cloudflarestatus.com
- **Support:** Available in dashboard

### Supabase Support
- **Dashboard:** https://app.supabase.com
- **Status Page:** https://status.supabase.com
- **Docs:** https://supabase.com/docs
- **Support:** Available in dashboard

### GoDaddy Support
- **Dashboard:** https://www.godaddy.com
- **Support:** Available in account dashboard

### GitHub Support
- **Repository:** https://github.com/justanotherdad/timesheet-app
- **Status:** https://www.githubstatus.com

---

## 📝 Important Credentials (Store Securely)

### Supabase
- **Project URL:** [Store in secure password manager]
- **Anon Key:** [Store in secure password manager]
- **Service Role Key:** [Store in secure password manager - if needed]

### Cloudflare
- **Account Email:** [Your email]
- **Pages Project:** `timesheet-app`

### GitHub
- **Repository:** `justanotherdad/timesheet-app`
- **Branch:** `main`

### Domain
- **Domain:** `ctgtimesheet.com`
- **Registrar:** GoDaddy
- **Nameservers:** Cloudflare (ns1.cloudflare.com, ns2.cloudflare.com)

---

## 🔧 Common Issues & Solutions

### Issue: Error 1016: Origin DNS error
**Solution:**
1. Go to Cloudflare Pages → Your project → Custom domains
2. Verify `ctgtimesheet.com` is listed and active
3. If not listed, add it: "Set up a custom domain" → Enter domain → Continue
4. Check Cloudflare DNS → Records:
   - Verify CNAME records point to correct Pages URL
   - Ensure records are Proxied (orange cloud)
5. Wait 5-10 minutes for DNS propagation
6. Test domain again

### Issue: Corporate firewall blocking site (Zscaler/Sanofi)
**Solution:**
1. **Immediate:** Test from outside corporate network or use Pages URL
2. **Short-term:** Contact IT: AIMS.EnterpriseSecurity@sanofi.com
   - Request whitelist for `ctgtimesheet.com`
   - Provide business justification
3. **Long-term:** After 30 days, submit Zscaler Site Review
   - Click "Continue" on warning page
   - Submit site review request
   - Request categorization as "Business" or "Productivity"

### Issue: App not updating after GitHub push
**Solution:**
1. Check Cloudflare Pages → Deployments for build status
2. Verify GitHub connection in Cloudflare Pages settings
3. Reconnect GitHub repository if needed

### Issue: Authentication not working
**Solution:**
1. Check Supabase → Authentication → URL Configuration
2. Verify redirect URLs include `https://ctgtimesheet.com/**`
3. Verify Site URL is set correctly

### Issue: Build fails with "Missing Supabase variables"
**Solution:**
1. Go to Cloudflare Pages → Settings → Environment Variables
2. Verify all 3 variables are set for Production
3. Re-add variables if missing

### Issue: Domain not resolving
**Solution:**
1. Check DNS records in Cloudflare
2. Verify CNAME records point to correct Pages URL
3. Check nameservers in GoDaddy
4. Wait for DNS propagation (up to 48 hours)

### Issue: SSL certificate errors
**Solution:**
1. Check Cloudflare → SSL/TLS → Overview
2. Verify certificate is active
3. Ensure SSL mode is "Full" or "Full (strict)"
4. Wait for certificate to auto-renew (usually automatic)

---

## 📅 Maintenance Schedule Summary

| Frequency | Tasks |
|-----------|-------|
| **Weekly** | Test app functionality, check deployments |
| **Monthly** | Review GitHub connection, Supabase status, SSL, env vars |
| **Quarterly** | Review DNS, nameservers, Supabase settings, GitHub repo |
| **Annually** | Domain renewal, billing review, security audit |

---

## ✅ Last Maintenance Completed

- **Date:** _______________
- **Completed by:** _______________
- **Notes:** _______________

---

## 📌 Notes Section

_Use this space for any additional notes or reminders:_

- 
- 
- 

---

**Remember:** Most connections are automatic once set up. Focus on monitoring deployments and keeping environment variables current.

**Last Checklist Update:** 2026-01-08

