import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canManageComp, reviewCompRequest } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const access = await canManageComp(admin, user.id, user.profile.role)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note : ''
  try {
    const result = await reviewCompRequest(admin, {
      requestId: id,
      reviewerId: user.id,
      decision: 'approved',
      note,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    void logAudit({
      actorId: user.id,
      actorName: user.profile.name,
      action: 'comp.approve',
      entityType: 'comp_request',
      entityId: id,
      newValues: { note: note.trim() || null },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[comp] approve failed', err)
    return NextResponse.json({ error: 'Could not approve' }, { status: 500 })
  }
}
