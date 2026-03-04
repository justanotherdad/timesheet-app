# Email Setup (Resend + Supabase SMTP)

This app uses **Supabase Auth** for forgot-password and invite emails. Supabase sends these via the SMTP provider you configure. No code changes are needed—all configuration is in the **Supabase Dashboard**.

---

## Step 1: Verify ctgtimesheet.com in Resend

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Click **Add Domain**
3. Enter `ctgtimesheet.com`
4. Resend will show **DNS records** to add. You'll typically see:
   - **MX record** (for inbound—optional for sending)
   - **SPF** (TXT record)
   - **DKIM** (TXT record)
5. Copy each record Resend shows (type, name, value)
6. Open **Cloudflare** → select `ctgtimesheet.com` → **DNS** → **Records**
7. For each record, click **Add record**:
   - **MX:** Type = MX, Name = (from Resend, often `@` or domain), Mail server = value from Resend, Priority = 10
   - **TXT (SPF/DKIM):** Type = TXT, Name = (from Resend), Content = value from Resend
8. Save all records
9. In Resend, click **Verify** (or wait a few minutes and refresh). Status should turn green.

---

## Step 2: Supabase SMTP Configuration

1. Go to [Supabase Dashboard](https://app.supabase.com) → your project
2. **Project Settings** → **Auth** → **SMTP**
3. Enable **Custom SMTP**
4. Enter:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587` (TLS)
   - **User:** `resend`
   - **Password:** Your Resend API key (Resend Dashboard → API Keys → Create → copy)
   - **Sender email:** `no-reply@ctgtimesheet.com`
   - **Sender name:** `CTG Timesheet` (optional)
5. Click **Save**

---

## Step 3: Redirect URLs (required for forgot password)

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add (one per line):
   - `https://ctgtimesheet.com/auth/callback`
   - `https://ctgtimesheet.com/auth/callback?next=/auth/setup-password`
   - `https://ctgtimesheet.com/auth/setup-password`
   - `https://ctgtimesheet.com/auth/confirm-reset`
   - `http://localhost:3000/auth/callback?next=/auth/setup-password` (for local testing)
   - `http://localhost:3000/auth/confirm-reset` (for local testing)
3. Set **Site URL** to `https://ctgtimesheet.com`
4. Click **Save**

---

## Step 3b: Custom Reset Password Email (recommended for corporate email)

Corporate email (Microsoft 365 Safe Links, Barracuda, etc.) often **prefetches** links before users click. The default reset link goes to Supabase, which consumes the one-time token on first request—so the scanner can use it before the user, causing "We couldn't verify your link."

To fix this without requiring private windows, use a **custom template** that links to your app first:

1. Supabase Dashboard → **Authentication** → **Email Templates**
2. Open the **Reset Password** template
3. Replace the link in the template with this (using your actual site URL):

   ```
   <a href="{{ .SiteURL }}/auth/confirm-reset?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>
   ```

4. Keep the rest of the template (subject, body text) as you like. Example full body:

   ```html
   <h2>Reset Password</h2>
   <p>Follow this link to reset the password for your user:</p>
   <p><a href="{{ .SiteURL }}/auth/confirm-reset?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
   ```

5. Click **Save**

Your app’s `/auth/confirm-reset` page receives the token and shows a “Continue to Set Password” button. The user clicks it to verify (link scanners don’t click, so they don’t consume the token). Employees can use the link in their normal browser without private/incognito.

---

## Step 4: Test Forgot Password

1. Go to https://ctgtimesheet.com (or your app URL)
2. Click **Forgot password?**
3. Enter an email that exists in Supabase Auth (e.g. a user who has already been invited)
4. Click **Send Reset Link**
5. Check:
   - Your inbox and spam
   - Resend Dashboard → **Emails** (see if it was sent and delivered)
   - Supabase Dashboard → **Authentication** → **Logs** (see any errors)

---

## Common Issues

| Symptom | Likely cause |
|--------|--------------|
| Error `{}` or blank | Redirect URL not in allowlist, or SMTP credentials wrong. Check Supabase Auth logs. |
| "Failed to send" | SMTP misconfigured. Verify Resend API key, port (465/587), and sender domain is verified. |
| Email not received | Check spam; verify domain in Resend; check Resend delivery logs. |
| "User not found" | The email must exist in Supabase Auth. Forgot password only works for users who have already been invited/signed up. |
| "We couldn't verify your link" / can't log in after setting password | Redirect URL was wrong. Add all URLs from Step 3 to Supabase Redirect URLs and request a new reset link. |
| "This link has expired or has already been used" (right after clicking) | **Email link scanning** (Microsoft Safe Links, Proofpoint, etc.) can consume the reset token before the user clicks. **Recommended fix:** Complete **Step 3b** above—use the custom Reset Password template so the link goes to your app first. Employees can then use the link in their normal browser. Otherwise: try a private/incognito window, or copy the link into the address bar. IT can also add your domain to Safe Links exclusions. |

## No Code Changes Needed

The app calls `supabase.auth.resetPasswordForEmail()`. Supabase handles:
- Sending the email via your SMTP
- Token generation
- Redirect flow

Your `NEXT_PUBLIC_SITE_URL` (or `window.location.origin`) is used for the redirect—ensure it matches your production domain so the reset link works.
