import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  loadCompanySettingsMap,
  parseConfirmationAssigneeIds,
  getPendingConfirmationsForUser,
} from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

/** Whether to show Timesheet Confirmations in nav + pending count for current user. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const settings = await loadCompanySettingsMap(admin)
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(user.id)) {
    return NextResponse.json({ showLink: false, pendingCount: 0 })
  }

  // Honor the per-user client filter so the badge count matches the list.
  const pending = await getPendingConfirmationsForUser(admin, user.id, settings)

  return NextResponse.json({ showLink: true, pendingCount: pending.length })
}
