# Fix IP Address Mismatch

## 🔴 Problem Found

**Vercel wants:** `216.198.79.1`  
**Cloudflare has:** `216.198.78.1`  

**The IP addresses don't match!** This is why it's showing "Invalid Configuration".

---

## ✅ Fix Steps

### Step 1: Update the A Record in Cloudflare

1. Go to: https://dash.cloudflare.com
2. Select domain: `ctgtimesheet.com`
3. Go to: **DNS** → **Records**
4. Find the **A record** for `ctgtimesheet.com`
5. Click **Edit**
6. Change the **IPv4 address** from `216.198.78.1` to `216.198.79.1`
   - **Current:** `216.198.78.1` ❌
   - **Change to:** `216.198.79.1` ✅
7. Keep **Proxy status:** Proxied (orange cloud) ✅
8. Click **Save**

---

## ✅ Step 2: Verify the CNAME for www

The `www` record looks correct (starts with `568150de62235a37.vercel-`), but verify:

1. In Cloudflare DNS → Records
2. Find the **CNAME** record for `www`
3. Make sure the **Content/Target** is exactly: `568150de62235a37.vercel-dns-017.com.`
   - Include the trailing dot (`.`)
   - Should match what Vercel shows exactly
4. If it's truncated or different, edit it to match Vercel exactly

---

## ⏱️ Step 3: Wait and Refresh

1. **Wait 5-10 minutes** for DNS to propagate
2. Go back to Vercel → **Domains**
3. Click **Refresh** on `ctgtimesheet.com`
4. Click **Refresh** on `www.ctgtimesheet.com`
5. Status should change to "Valid Configuration" ✅

---

## 🎯 Expected Result

After fixing the IP:

**In Cloudflare:**
- ✅ A record: `ctgtimesheet.com` → `216.198.79.1` (Proxied)
- ✅ CNAME record: `www` → `568150de62235a37.vercel-dns-017.com.` (Proxied)

**In Vercel:**
- ✅ `ctgtimesheet.com` → "Valid Configuration" (green)
- ✅ `www.ctgtimesheet.com` → "Valid Configuration" (green)

**When you visit:**
- ✅ https://ctgtimesheet.com → Works!
- ✅ https://www.ctgtimesheet.com → Works!

---

## 🔍 About the "Proxy Detected" Warning

Vercel shows a warning about "Proxy Detected" for `www.ctgtimesheet.com`. This is because Cloudflare's proxy is enabled.

**You have two options:**

### Option A: Keep Proxy (Recommended)
- Keep Cloudflare proxy enabled (orange cloud)
- This provides DDoS protection and caching
- Vercel will still work, just with a warning
- The warning won't prevent the site from working

### Option B: Disable Proxy (If you want)
- In Cloudflare, click Edit on the `www` CNAME record
- Change Proxy status from "Proxied" to "DNS only" (grey cloud)
- This removes the warning but also removes Cloudflare's protection
- **Not recommended** unless you have a specific reason

**For now, keep the proxy enabled** - the site will work fine with it.

---

## 📋 Quick Checklist

- [ ] Changed A record IP from `216.198.78.1` to `216.198.79.1`
- [ ] Verified CNAME for `www` matches Vercel exactly
- [ ] Saved changes in Cloudflare
- [ ] Waited 5-10 minutes
- [ ] Clicked Refresh in Vercel
- [ ] Both domains show "Valid Configuration"

---

## 🆘 If Still Not Working

### Check 1: Verify IP is Updated
- In Cloudflare, double-check the A record shows `216.198.79.1`
- Not `216.198.78.1` (old value)

### Check 2: Check DNS Propagation
- Use: https://dnschecker.org
- Enter: `ctgtimesheet.com`
- Select: `A` record
- Check if it shows `216.198.79.1` globally

### Check 3: Clear Browser Cache
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Or try incognito/private window

### Check 4: Wait Longer
- Sometimes DNS takes 15-30 minutes
- Try refreshing in Vercel after waiting longer

---

**The main fix is changing that one digit in the IP address: `78` → `79`**
