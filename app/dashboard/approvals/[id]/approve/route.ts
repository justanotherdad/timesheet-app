import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
    const supabase = await createClient()
    const { id } = await params

    // Get the timesheet with owner's approval chain: manager first, then supervisor, then final approver
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('*, user_profiles!inner(manager_id, supervisor_id, final_approver_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as { manager_id?: string; supervisor_id?: string; final_approver_id?: string }
    // Approval chain order: manager first, then supervisor, then final approver (if no manager, next in line)
    const chain: string[] = []
    if (profile?.manager_id) chain.push(profile.manager_id)
    if (profile?.supervisor_id && !chain.includes(profile.supervisor_id)) chain.push(profile.supervisor_id)
    if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)

    // Allow approval of submitted timesheets, or allow admins to approve any status
    if (timesheet.status !== 'submitted' && !['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Timesheet is not in submitted status' }, { status: 400 })
    }

    // Who has already signed (by signer_id)
    const { data: existingSignatures } = await supabase
      .from('timesheet_signatures')
      .select('signer_id, signer_role')
      .eq('timesheet_id', id)
    const signedIds = (existingSignatures || []).map((s: { signer_id: string }) => s.signer_id)

    // Next approver is first in chain who hasn't signed; admins can always approve (treated as final)
    const nextApproverId = chain.find((uid) => !signedIds.includes(uid))
    const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)
    const canApprove = isAdmin || (nextApproverId !== undefined && nextApproverId === user.id)

    if (!canApprove) {
      return NextResponse.json(
        { error: 'You are not the next approver in line for this timesheet.' },
        { status: 403 }
      )
    }

    // Determine signer role for this user
    let signerRole: 'manager' | 'supervisor' | 'final_approver'
    if (user.id === profile?.final_approver_id || isAdmin) {
      signerRole = 'final_approver'
    } else if (user.id === profile?.manager_id) {
      signerRole = 'manager'
    } else {
      signerRole = 'supervisor'
    }

    // Create signature (DB may need signer_role to allow 'final_approver' – add enum value if required)
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

    // Only set to approved when final approver signs (or admin); then locked to employee
    const isFinalApproval = signerRole === 'final_approver'
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }
    if (isFinalApproval) {
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
