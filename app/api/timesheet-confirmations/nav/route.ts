import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { loadCompanySettingsMap, parseConfirmationAssigneeIds } from '@/lib/timesheet-confirmation'

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

  const { data: receipts } = await admin
    .from('timesheet_confirmation_receipts')
    .select('timesheet_id, approval_sequence')
    .eq('user_id', user.id)
  const receiptKey = new Set((receipts || []).map((r) => `${r.timesheet_id}:${r.approval_sequence}`))

  const { data: approved } = await admin
    .from('weekly_timesheets')
    .select('id, approval_confirmation_sequence')
    .eq('status', 'approved')

  let pendingCount = 0
  for (const row of approved || []) {
    const seq = (row as { approval_confirmation_sequence?: number }).approval_confirmation_sequence ?? 0
    if (seq <= 0) continue
    const key = `${(row as { id: string }).id}:${seq}`
    if (!receiptKey.has(key)) pendingCount += 1
  }

  return NextResponse.json({ showLink: true, pendingCount })
}
