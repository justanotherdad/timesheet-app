import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { isInternalEmployee } from '@/lib/pto'
import {
  countUnseenCompDecisions,
  createCompRequest,
  isSundayYmd,
  listUserCompRequests,
  markCompDecisionsSeen,
  parseCompHours,
  summarizeComp,
} from '@/lib/comp'

export const dynamic = 'force-dynamic'

function forbidden(user: { profile: { role: string; employee_type?: string | null } } | null) {
  return !user || user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (forbidden(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const admin = createAdminClient()
    const requests = await listUserCompRequests(admin, user.id)
    const tally = summarizeComp(requests)
    let unseenDecisions = 0
    try {
      unseenDecisions = await countUnseenCompDecisions(admin, user.id)
      await markCompDecisionsSeen(admin, user.id)
    } catch (err) {
      console.error('[comp] mark decisions seen failed', err)
    }
    return NextResponse.json({ requests, ...tally, unseenDecisions })
  } catch (err) {
    console.error('[comp] list mine failed', err)
    return NextResponse.json({ error: 'Could not load comp time' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (forbidden(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'use' ? 'use' : body.kind === 'bank' ? 'bank' : null
  const weekEnding = typeof body.weekEnding === 'string' ? body.weekEnding : ''
  const hours = parseCompHours(body.hours)
  if (!kind) return NextResponse.json({ error: 'Choose Bank Comp or Use Comp.' }, { status: 400 })
  if (!isSundayYmd(weekEnding)) return NextResponse.json({ error: 'Week ending must be a Sunday.' }, { status: 400 })
  if (hours == null) return NextResponse.json({ error: 'Enter hours greater than 0.' }, { status: 400 })

  try {
    const admin = createAdminClient()
    const created = await createCompRequest(admin, {
      userId: user.id,
      kind,
      weekEnding,
      hours,
      clientAcknowledged: body.clientAcknowledged === true,
    })
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 })
    void logAudit({
      actorId: user.id,
      actorName: user.profile.name,
      action: 'comp.submit',
      entityType: 'comp_request',
      entityId: created.request.id,
      newValues: {
        kind: created.request.kind,
        week_ending: created.request.week_ending,
        hours: created.request.hours,
      },
    })
    return NextResponse.json({ request: created.request })
  } catch (err) {
    console.error('[comp] create failed', err)
    return NextResponse.json({ error: 'Could not submit request' }, { status: 500 })
  }
}
