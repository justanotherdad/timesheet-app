import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canManageComp, listCompAudit, listCompHistory, listCompQueue, listInternalEmployees } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const access = await canManageComp(admin, user.id, user.profile.role)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [queue, history, audit, people] = await Promise.all([
      listCompQueue(admin),
      listCompHistory(admin),
      listCompAudit(admin),
      access.isAdmin ? listInternalEmployees(admin) : Promise.resolve([]),
    ])
    return NextResponse.json({ queue, history, audit, people, isAdmin: access.isAdmin })
  } catch (err) {
    console.error('[comp] review load failed', err)
    return NextResponse.json({ error: 'Could not load comp requests' }, { status: 500 })
  }
}
