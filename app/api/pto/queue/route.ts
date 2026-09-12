import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { isPtoApprover, listPendingPtoQueue, loadPtoApproverIds } from '@/lib/pto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const approvers = await loadPtoApproverIds(admin)
  if (!isPtoApprover(user.id, approvers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const requests = await listPendingPtoQueue(admin)
    return NextResponse.json({ requests })
  } catch (err) {
    console.error('[pto] queue failed', err)
    return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  }
}
