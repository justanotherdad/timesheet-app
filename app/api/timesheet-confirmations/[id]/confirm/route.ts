import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { loadCompanySettingsMap, parseConfirmationAssigneeIds } from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: timesheetId } = await params
  const admin = createAdminClient()

  const settings = await loadCompanySettingsMap(admin)
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(user.id)) {
    return NextResponse.json({ error: 'Not a timesheet confirmation assignee' }, { status: 403 })
  }

  const { data: ts, error: tsErr } = await admin
    .from('weekly_timesheets')
    .select('id, status, approval_confirmation_sequence')
    .eq('id', timesheetId)
    .single()

  if (tsErr || !ts) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  if (ts.status !== 'approved') {
    return NextResponse.json({ error: 'Timesheet is not approved' }, { status: 400 })
  }

  const seq = (ts as { approval_confirmation_sequence?: number }).approval_confirmation_sequence ?? 0
  if (seq <= 0) {
    return NextResponse.json({ error: 'Invalid confirmation sequence' }, { status: 400 })
  }

  const { error: insErr } = await admin.from('timesheet_confirmation_receipts').insert({
    timesheet_id: timesheetId,
    user_id: user.id,
    approval_sequence: seq,
  })

  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ ok: true, alreadyConfirmed: true })
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
