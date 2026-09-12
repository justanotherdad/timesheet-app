import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { cancelPtoRequest, isInternalEmployee } from '@/lib/pto'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const admin = createAdminClient()
  const result = await cancelPtoRequest(admin, id, user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logAudit({
    actorId: user.id,
    actorName: user.profile.name,
    action: 'pto.cancel',
    entityType: 'pto_request',
    entityId: id,
    newValues: { status: 'cancelled' },
  })
  return NextResponse.json({ ok: true })
}
