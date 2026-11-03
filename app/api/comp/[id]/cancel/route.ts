import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canManageComp, cancelCompRequest } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const access = await canManageComp(admin, user.id, user.profile.role)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    const result = await cancelCompRequest(admin, { requestId: id, actorId: user.id })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    void logAudit({
      actorId: user.id,
      actorName: user.profile.name,
      action: 'comp.cancel',
      entityType: 'comp_request',
      entityId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[comp] cancel failed', err)
    return NextResponse.json({ error: 'Could not cancel' }, { status: 500 })
  }
}
