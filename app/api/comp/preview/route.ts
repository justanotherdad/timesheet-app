import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { isInternalEmployee } from '@/lib/pto'
import { buildCompPreview, isSundayYmd } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const weekEnding = new URL(req.url).searchParams.get('weekEnding') || ''
  if (!isSundayYmd(weekEnding)) {
    return NextResponse.json({ error: 'Week ending must be a Sunday.' }, { status: 400 })
  }
  try {
    const preview = await buildCompPreview(createAdminClient(), user.id, weekEnding)
    return NextResponse.json(preview)
  } catch (err) {
    console.error('[comp] preview failed', err)
    return NextResponse.json({ error: 'Could not check this week' }, { status: 500 })
  }
}
