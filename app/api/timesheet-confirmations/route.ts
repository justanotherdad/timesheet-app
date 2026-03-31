import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { loadCompanySettingsMap, parseConfirmationAssigneeIds } from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const settings = await loadCompanySettingsMap(admin)
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(user.id)) {
    return NextResponse.json({ timesheets: [] })
  }

  const { data: receipts } = await admin
    .from('timesheet_confirmation_receipts')
    .select('timesheet_id, approval_sequence')
    .eq('user_id', user.id)
  const receiptKey = new Set((receipts || []).map((r) => `${r.timesheet_id}:${r.approval_sequence}`))

  const { data: approved, error } = await admin
    .from('weekly_timesheets')
    .select('id, user_id, week_ending, week_starting, approval_confirmation_sequence, approved_at, user_profiles!user_id(name)')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pending = (approved || []).filter((row: any) => {
    const seq = row.approval_confirmation_sequence ?? 0
    if (seq <= 0) return false
    return !receiptKey.has(`${row.id}:${seq}`)
  })

  return NextResponse.json({
    timesheets: pending.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      week_ending: ts.week_ending,
      week_starting: ts.week_starting,
      approved_at: ts.approved_at,
      employee_name: (ts.user_profiles as { name?: string })?.name || 'Unknown',
    })),
  })
}
