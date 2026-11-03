import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { addCompHours, canManageComp, isAdminRole, isSundayYmd, parseCompHours } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const access = await canManageComp(admin, user.id, user.profile.role)
  if (!access.allowed || !isAdminRole(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const weekEnding = typeof body.weekEnding === 'string' ? body.weekEnding : ''
  const hours = parseCompHours(body.hours)
  if (!userId) return NextResponse.json({ error: 'Choose a person.' }, { status: 400 })
  if (!isSundayYmd(weekEnding)) return NextResponse.json({ error: 'Week ending must be a Sunday.' }, { status: 400 })
  if (hours == null) return NextResponse.json({ error: 'Enter hours greater than 0.' }, { status: 400 })

  try {
    const added = await addCompHours(admin, { actorId: user.id, userId, weekEnding, hours })
    if (!added.ok) return NextResponse.json({ error: added.error }, { status: 400 })
    void logAudit({
      actorId: user.id,
      actorName: user.profile.name,
      action: 'comp.add',
      entityType: 'comp_request',
      entityId: added.request.id,
      newValues: { user_id: userId, week_ending: weekEnding, hours },
    })
    return NextResponse.json({ request: added.request })
  } catch (err) {
    console.error('[comp] admin add failed', err)
    return NextResponse.json({ error: 'Could not add hours' }, { status: 500 })
  }
}
