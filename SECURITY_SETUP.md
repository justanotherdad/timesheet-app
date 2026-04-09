# Security Setup Guide

This guide covers manual security configuration and app-level security features.

---

## 1. Cloudflare Bot Fight Mode (Manual)

**Location:** Cloudflare Dashboard → Your domain → Security → Bots

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select **ctgtimesheet.com**
3. Navigate to **Security** → **Bots**
4. Enable **Bot Fight Mode** (free plan)
   - Challenges or blocks known malicious bots
   - No CAPTCHA for humans on the free tier

**Note:** Super Bot Fight Mode (with CAPTCHA challenges) requires a Pro plan.

---

## 2. Supabase Auth Settings (Manual)

**Location:** Supabase Dashboard → Authentication → Providers → Email

### Leaked Password Protection
- Enable **Leaked password protection**
- Blocks passwords found in known breach databases

### OTP Expiration
- Set **Email OTP Expiration** to **3600** (1 hour) or **86400** (1 day)
- Shorter = more secure, longer = better UX for password reset links

### MFA (Optional)
- Enable **Multi-factor authentication** for admin accounts
- Location: Auth → Providers → Phone (or configure MFA per user)

---

## 3. App-Level Security (Configured in Code)

### Rate Limiting (Upstash Redis)
- **Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Create free Redis at [Upstash Console](https://console.upstash.com/)
- If not set, rate limiting is skipped (graceful fallback)

### Security Headers
- Applied automatically via `next.config.ts`
- CSP, HSTS, X-Frame-Options, etc.

### Cloudflare Turnstile (login + forgot password)
- **Env vars:**
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — site key from Cloudflare Turnstile (widget)
  - `TURNSTILE_SECRET_KEY` — secret key (server only; never expose to the client)
- Sign-in uses `POST /api/auth/login` (server verifies Turnstile, then Supabase session cookies).
- Forgot password uses `POST /api/auth/forgot-password` with the same verification.
- **Development:** If `TURNSTILE_SECRET_KEY` is unset, verification is skipped so local dev can run without keys. **Production** requires the secret.
- **Production:** Set both keys; CSP allows `https://challenges.cloudflare.com` for scripts, frames, and connect.

