import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Session expired. Please use your invitation link again.' }, { status: 401 })
  }

  let body: { password?: string; confirmPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { password, confirmPassword } = body
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Clear must_change_password when user sets password (invite/recovery flow)
  const admin = (await import('@/lib/supabase/admin')).createAdminClient()
  await admin.from('user_profiles').update({ must_change_password: false }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
