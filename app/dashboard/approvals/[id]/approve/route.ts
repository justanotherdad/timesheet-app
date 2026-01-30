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

    // Get the timesheet with owner's approval chain (reports_to, supervisor, manager)
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('*, user_profiles!inner(reports_to_id, supervisor_id, manager_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string }
    // User can approve if they are the employee's reports_to, supervisor, or manager (or admin)
    const canApprove =
      profile?.reports_to_id === user.id ||
      profile?.supervisor_id === user.id ||
      profile?.manager_id === user.id ||
      timesheet.user_id === user.id ||
      ['admin', 'super_admin'].includes(user.profile.role)

    if (!canApprove) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Allow approval of submitted timesheets, or allow admins to approve any status
    if (timesheet.status !== 'submitted' && !['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Timesheet is not in submitted status' }, { status: 400 })
    }

    // Determine signer role
    const signerRole = ['manager', 'admin', 'super_admin'].includes(user.profile.role)
      ? 'manager'
      : 'supervisor'

    // Check for existing signatures
    const { data: existingSignatures } = await supabase
      .from('timesheet_signatures')
      .select('signer_role')
      .eq('timesheet_id', id)

    const hasManagerSignature = existingSignatures?.some(sig => sig.signer_role === 'manager') || false
    const isManagerApproving = signerRole === 'manager'

    // Create signature
    const { error: signatureError } = await supabase
      .from('timesheet_signatures')
      .insert({
        timesheet_id: id,
        signer_id: user.id,
        signer_role: signerRole,
      })

    if (signatureError) {
      return NextResponse.json({ error: signatureError.message }, { status: 500 })
    }

    // Update timesheet status
    // Only set to 'approved' if a manager (or admin/super_admin) is approving
    // Supervisor approvals keep status as 'submitted' until manager approves
    const newStatus = isManagerApproving ? 'approved' : 'submitted'
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (isManagerApproving) {
      updateData.status = 'approved'
      updateData.approved_by_id = user.id
      updateData.approved_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('weekly_timesheets')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL('/dashboard/approvals', request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
