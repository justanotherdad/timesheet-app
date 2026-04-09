import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyTurnstileToken } from '@/lib/turnstile-verify'

export const dynamic = 'force-dynamic'

function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
}

function getRequestOrigin(request: Request): string {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }
  return 'http://localhost:3000'
}

export async function POST(request: Request) {
  let body: { email?: string; turnstileToken?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const verify = await verifyTurnstileToken(turnstileToken, clientIp(request))
  if (!verify.ok) {
    return NextResponse.json({ error: verify.error }, { status: 400 })
  }

  const supabase = await createClient()
  const origin = getRequestOrigin(request)
  const redirectTo = `${origin}/auth/callback?next=/auth/setup-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to send reset email.' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
