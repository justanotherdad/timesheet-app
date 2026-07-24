import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyTurnstileToken } from '@/lib/turnstile-verify'

export const dynamic = 'force-dynamic'

function clientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; turnstileToken?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const verify = await verifyTurnstileToken(turnstileToken, clientIp(request))
  if (!verify.ok) {
    return NextResponse.json({ error: verify.error }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    // Supabase's raw "Email not confirmed" tells the user nothing they can act
    // on — they can't self-serve out of it either, since password resets aren't
    // emailed to unconfirmed addresses.
    const isUnconfirmed = /email not confirmed/i.test(signInError.message || '')
    return NextResponse.json(
      {
        error: isUnconfirmed
          ? 'Your account has not been activated yet. Please contact your administrator to have your password set.'
          : signInError.message || 'Invalid email or password.',
      },
      { status: 401 }
    )
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Sign-in failed.' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, must_change_password')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) {
    await supabase.auth.signOut()
    return NextResponse.json(
      { error: 'Your account is not fully set up. Please contact your administrator to complete your profile.' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    ok: true,
    mustChangePassword: Boolean((profile as { must_change_password?: boolean }).must_change_password),
  })
}
