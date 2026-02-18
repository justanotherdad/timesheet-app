import { createClient } from '@/lib/supabase/server'
import { checkAuthRateLimit } from '@/lib/rate-limit'
import { logAuditEvent } from '@/lib/audit-log'
import { NextResponse } from 'next/server'

const RECAPTCHA_MIN_SCORE = 0.5

async function verifyRecaptcha(token: string, expectedAction = 'login'): Promise<boolean> {
  // reCAPTCHA Enterprise (project ID + API key)
  const projectId = process.env.RECAPTCHA_PROJECT_ID
  const apiKey = process.env.RECAPTCHA_API_KEY
  if (projectId && apiKey) {
    const res = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            token,
            expectedAction,
            siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
          },
        }),
      }
    )
    const data = await res.json()
    const score = data.riskAnalysis?.score ?? 0
    const valid = data.tokenProperties?.valid === true
    return valid && score >= RECAPTCHA_MIN_SCORE
  }

  // Standard reCAPTCHA v3 (secret key)
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return true // Skip if not configured (dev)

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${token}`,
  })
  const data = await res.json()
  return data.success === true && (data.score ?? 0) >= RECAPTCHA_MIN_SCORE
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
  const userAgent = request.headers.get('user-agent') ?? undefined

  // Rate limit
  const { ok: rateOk } = await checkAuthRateLimit(ip)
  if (!rateOk) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  let body: { email?: string; password?: string; captchaToken?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { email, password, captchaToken } = body
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Verify CAPTCHA (skip if not configured)
  const hasRecaptcha =
    (process.env.RECAPTCHA_PROJECT_ID && process.env.RECAPTCHA_API_KEY) ||
    process.env.RECAPTCHA_SECRET_KEY
  if (hasRecaptcha && !(await verifyRecaptcha(captchaToken || ''))) {
    await logAuditEvent(
      { type: 'login_failure', email, reason: 'captcha_failed' },
      { ip, userAgent }
    )
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    await logAuditEvent(
      { type: 'login_failure', email, reason: error.message },
      { ip, userAgent }
    )
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  if (data.user) {
    await logAuditEvent(
      { type: 'login_success', userId: data.user.id, email: data.user.email ?? email },
      { ip, userAgent }
    )
  }

  return NextResponse.json({ success: true })
}
