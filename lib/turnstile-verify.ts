/**
 * Verify a Cloudflare Turnstile token (server-side only).
 * If TURNSTILE_SECRET_KEY is unset in development, verification is skipped (local dev without keys).
 * In production, the secret must be set and a token is required.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (dev only)')
      return { ok: true }
    }
    return { ok: false, error: 'Sign-in verification is not configured.' }
  }
  if (!token?.trim()) {
    return { ok: false, error: 'Please complete the verification challenge.' }
  }

  const body = new URLSearchParams()
  body.append('secret', secret)
  body.append('response', token.trim())
  if (remoteIp) body.append('remoteip', remoteIp)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as { success?: boolean }
  if (!data.success) {
    return { ok: false, error: 'Verification failed. Please try again.' }
  }
  return { ok: true }
}
