import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { countPendingPtoRequests, isInternalEmployee, isPtoApprover, loadPtoApproverIds } from '@/lib/pto'

export const dynamic = 'force-dynamic'

/** Whether to show PTO links in nav + pending review count. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isClient = user.profile.role === 'client'
  const showRequestLink = !isClient && isInternalEmployee(user.profile.employee_type)

  const admin = createAdminClient()
  let showReviewLink = false
  let pendingCount = 0
  try {
    const approvers = await loadPtoApproverIds(admin)
    showReviewLink = !isClient && isPtoApprover(user.id, approvers)
    if (showReviewLink) {
      pendingCount = await countPendingPtoRequests(admin)
    }
  } catch (err) {
    console.error('[pto] nav count failed', err)
  }

  return NextResponse.json({
    showRequestLink,
    showReviewLink,
    pendingCount,
  })
}
