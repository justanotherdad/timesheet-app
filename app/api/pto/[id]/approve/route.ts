import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { isPtoApprover, loadPtoApproverIds, reviewPtoRequest } from '@/lib/pto'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const approvers = await loadPtoApproverIds(admin)
  if (!isPtoApprover(user.id, approvers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const result = await reviewPtoRequest(admin, id, user.id, 'approved')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logAudit({
    actorId: user.id,
    actorName: user.profile.name,
    action: 'pto.approve',
    entityType: 'pto_request',
    entityId: id,
    newValues: { status: 'approved' },
  })
  return NextResponse.json({ ok: true })
}
