import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { id } = await params

    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('*, user_profiles!inner(reports_to_id, manager_id, supervisor_id, final_approver_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as { reports_to_id?: string; manager_id?: string; supervisor_id?: string; final_approver_id?: string }
    const canApprove =
      profile?.reports_to_id === user.id ||
      profile?.manager_id === user.id ||
      profile?.supervisor_id === user.id ||
      profile?.final_approver_id === user.id ||
      timesheet.user_id === user.id ||
      ['admin', 'super_admin'].includes(user.profile.role)

    if (!canApprove) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from('weekly_timesheets')
      .update({
        rejection_reason: null,
        rejected_by_id: null,
        rejected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL(`/dashboard/timesheets/${id}`, request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
