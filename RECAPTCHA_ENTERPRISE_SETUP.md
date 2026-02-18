# reCAPTCHA Enterprise Setup

Complete these steps to activate reCAPTCHA Enterprise for your CTG Timesheet app.

---

## Step 1: Enable the reCAPTCHA Enterprise API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project: **ctg-timesheet-1768525801662**
3. Go to **APIs & Services** → **Library**
4. Search for **reCAPTCHA Enterprise API**
5. Click **Enable**

---

## Step 2: Create an API Key (for server-side verification)

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **API key**
3. Copy the generated API key
4. (Optional) Click **Restrict key** to limit it to reCAPTCHA Enterprise API only
5. Add the key to `.env.local` as `RECAPTCHA_API_KEY=your_key_here`

---

## Step 3: Authenticate (if you see the warning)

If the reCAPTCHA docs show "Before proceeding, you must authenticate with reCAPTCHA":

1. Ensure the **reCAPTCHA Enterprise API** is enabled (Step 1)
2. Ensure you have an **API key** with access to the API (Step 2)
3. The API key must have permission to call the assessments endpoint

---

## Step 4: Add env vars to `.env.local`

Your `.env.local` should have:

```bash
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LcZHG8sAAAAAIApjbJkYHA000nDCcqNw9M4784b
RECAPTCHA_PROJECT_ID=ctg-timesheet-1768525801662
RECAPTCHA_API_KEY=your_actual_api_key_here
NEXT_PUBLIC_RECAPTCHA_ENTERPRISE=true
```

Replace `your_actual_api_key_here` with the API key from Step 2.

---

## Step 5: Add env vars to production

Add the same variables to your hosting provider (Vercel, Cloudflare, etc.):

- **NEXT_PUBLIC_RECAPTCHA_SITE_KEY** (public)
- **RECAPTCHA_PROJECT_ID** (can be public)
- **RECAPTCHA_API_KEY** (secret – never expose)
- **NEXT_PUBLIC_RECAPTCHA_ENTERPRISE** = `true`

---

## Verification flow (what the code does)

1. **Client:** Loads `recaptcha/enterprise.js` and calls `grecaptcha.enterprise.execute()` on login
2. **Server:** Receives the token and POSTs to `https://recaptchaenterprise.googleapis.com/v1/projects/{PROJECT_ID}/assessments?key={API_KEY}`
3. **Response:** Uses the risk score (0.0–1.0) – scores ≥ 0.5 are treated as human
