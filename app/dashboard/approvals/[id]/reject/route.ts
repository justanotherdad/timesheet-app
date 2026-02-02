import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
    const supabase = await createClient()
    const { id } = await params

    // Get the timesheet with owner email and approval chain for permission check
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id(reports_to_id, supervisor_id, manager_id, final_approver_id, email, name)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const ownerProfile = timesheet.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string; email?: string; name?: string }
    const canReject =
      ownerProfile?.reports_to_id === user.id ||
      ownerProfile?.supervisor_id === user.id ||
      ownerProfile?.manager_id === user.id ||
      ownerProfile?.final_approver_id === user.id ||
      timesheet.user_id === user.id ||
      ['admin', 'super_admin'].includes(user.profile.role)

    if (!canReject) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (timesheet.status !== 'submitted') {
      return NextResponse.json({ error: 'Timesheet is not in submitted status' }, { status: 400 })
    }

    // Get rejection reason from form data if available
    const formData = await request.formData()
    const rejectionReason = formData.get('reason') as string || 'Rejected by approver'

    // Update timesheet status
    const { error: updateError } = await supabase
      .from('weekly_timesheets')
      .update({
        status: 'rejected',
        rejected_by_id: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // TODO: Send email notification to employee
    // For now, the employee will see the rejection status in their timesheet list
    // To implement email notifications, configure Supabase email templates or use a third-party service
    // Example: await supabase.functions.invoke('send-rejection-email', {
    //   body: { email: ownerProfile?.email, timesheetId: id, reason: rejectionReason }
    // })

    return NextResponse.redirect(new URL('/dashboard/approvals', request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

