# Fix "Invalid Configuration" in Vercel

Your domains are added to Vercel, but they show "Invalid Configuration" because DNS records need to be updated.

---

## 🔍 Step 1: Get DNS Records from Vercel

1. In Vercel dashboard → **Domains** section
2. Click on **`ctgtimesheet.com`** (the one with red "Invalid Configuration")
3. Vercel will show you the DNS records needed
4. You'll see something like:

   **For `ctgtimesheet.com`:**
   - Type: `A` or `CNAME`
   - Name: `@` or `ctgtimesheet.com`
   - Value: An IP address or `cname.vercel-dns.com`

   **For `www.ctgtimesheet.com`:**
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com` (or similar)

**Note down these values!**

---

## 🔧 Step 2: Update DNS in Cloudflare

1. Go to: https://dash.cloudflare.com
2. Select domain: **`ctgtimesheet.com`**
3. Go to: **DNS** → **Records**

### Update `ctgtimesheet.com` (root domain):

**Option A: If Vercel shows an A record (IP address):**
1. Find existing `ctgtimesheet.com` record
2. Edit it:
   - **Type:** `A`
   - **Name:** `@` or `ctgtimesheet.com`
   - **IPv4 address:** (the IP Vercel provided)
   - **Proxy status:** Proxied (orange cloud) ✅
3. Save

**Option B: If Vercel shows a CNAME:**
1. Find existing `ctgtimesheet.com` record
2. Edit it:
   - **Type:** `CNAME`
   - **Name:** `@` or `ctgtimesheet.com`
   - **Target:** (the CNAME value Vercel provided, e.g., `cname.vercel-dns.com`)
   - **Proxy status:** Proxied (orange cloud) ✅
3. Save

### Update `www.ctgtimesheet.com`:

1. Find or create `www` record
2. Edit/Create:
   - **Type:** `CNAME`
   - **Name:** `www`
   - **Target:** (the CNAME value Vercel provided, e.g., `cname.vercel-dns.com`)
   - **Proxy status:** Proxied (orange cloud) ✅
3. Save

---

## ⏱️ Step 3: Wait for DNS Propagation

1. **Wait 5-10 minutes** for DNS to propagate
2. DNS changes can take up to 24 hours, but usually 5-10 minutes

---

## ✅ Step 4: Verify in Vercel

1. Go back to Vercel → **Domains**
2. Click **"Refresh"** button on `ctgtimesheet.com`
3. Wait a moment
4. The status should change from:
   - ❌ "Invalid Configuration" (red)
   - ✅ "Valid Configuration" (green)

5. Do the same for `www.ctgtimesheet.com`

---

## 🔍 What to Check if Still Invalid

### Check 1: DNS Records Match
- Compare Cloudflare DNS records with what Vercel shows
- Make sure the **Target/Value** matches exactly
- Make sure **Type** matches (A or CNAME)

### Check 2: Proxy Status
- In Cloudflare, make sure records are **Proxied** (orange cloud)
- This is important for SSL certificates

### Check 3: Wait Longer
- Sometimes DNS takes 15-30 minutes
- Try refreshing in Vercel after waiting

### Check 4: Check Current DNS
You can check what DNS is currently set:
```bash
# In Terminal (on your Mac)
dig ctgtimesheet.com
dig www.ctgtimesheet.com
```

Or use online tool: https://dnschecker.org
- Enter: `ctgtimesheet.com`
- Select: `CNAME` or `A` record
- Check if it shows Vercel's values

---

## 🎯 Expected Result

After DNS updates and propagation:

**In Vercel:**
- ✅ `ctgtimesheet.com` → "Valid Configuration" (green)
- ✅ `www.ctgtimesheet.com` → "Valid Configuration" (green)
- ✅ SSL certificate issued automatically

**When you visit:**
- ✅ https://ctgtimesheet.com → Works!
- ✅ https://www.ctgtimesheet.com → Works!
- ✅ No Error 522!

---

## 🆘 If Still Not Working

### Option 1: Use Vercel's Nameservers (Advanced)

If CNAME/A records don't work, you can use Vercel's nameservers:

1. In Vercel → Domain settings
2. Look for "Nameservers" option
3. Vercel will provide nameserver addresses
4. In Cloudflare → Domain → DNS → Nameservers
5. Update to Vercel's nameservers
6. **Note:** This removes Cloudflare's proxy features

### Option 2: Check Cloudflare Settings

1. Cloudflare → Domain → **SSL/TLS**
2. Make sure encryption mode is: **Full** or **Full (strict)**
3. This is required for Vercel SSL certificates

### Option 3: Contact Support

- Vercel has support chat in dashboard
- They can help verify DNS configuration

---

## 📋 Quick Checklist

- [ ] Got DNS records from Vercel (click on domain to see them)
- [ ] Updated `ctgtimesheet.com` record in Cloudflare
- [ ] Updated `www.ctgtimesheet.com` record in Cloudflare
- [ ] Both records set to **Proxied** (orange cloud)
- [ ] Waited 5-10 minutes
- [ ] Clicked "Refresh" in Vercel
- [ ] Status changed to "Valid Configuration"

---

## 💡 Common Issues

**Issue:** "Invalid Configuration" persists after 30 minutes
**Solution:** 
- Double-check DNS values match exactly
- Make sure records are Proxied
- Try using A record instead of CNAME (or vice versa)

**Issue:** SSL certificate not issuing
**Solution:**
- Make sure DNS is correct first
- SSL takes a few minutes after DNS is correct
- Check Cloudflare SSL/TLS mode is "Full"

**Issue:** Site works on Vercel URL but not custom domain
**Solution:**
- DNS hasn't propagated yet
- Wait longer and refresh
- Check DNS with dig or dnschecker.org

---

**The key is:** Make sure Cloudflare DNS records point to Vercel's values, then wait for propagation and refresh in Vercel.
