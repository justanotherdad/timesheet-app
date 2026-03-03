import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { NextResponse } from 'next/server'

function getSafeReturnTo(request: Request, formData: FormData): string {
  const returnTo = formData.get('returnTo') as string | null
  return returnTo &&
    returnTo.startsWith('/dashboard/approvals') &&
    !returnTo.includes('//')
    ? returnTo
    : '/dashboard/approvals'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const formData = await request.formData()
    const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
    const adminSupabase = createAdminClient()
    const { id } = await params

    // Use admin client so RLS does not block supervisors/managers from reading the employee's timesheet
    const { data: timesheet, error: fetchError } = await adminSupabase
      .from('weekly_timesheets')
      .select('*, user_profiles!user_id(manager_id, supervisor_id, final_approver_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as { manager_id?: string; supervisor_id?: string; final_approver_id?: string }
    // Approval chain: Employee → Supervisor → Manager → Final Approver (skip none = use next in line)
    const chain: string[] = []
    if (profile?.supervisor_id) chain.push(profile.supervisor_id)
    if (profile?.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
    if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)

    // Allow approval of submitted timesheets, or allow admins to approve any status
    if (timesheet.status !== 'submitted' && !['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Timesheet is not in submitted status' }, { status: 400 })
    }

    // Who has already signed (by signer_id)
    const { data: existingSignatures } = await adminSupabase
      .from('timesheet_signatures')
      .select('signer_id, signer_role')
      .eq('timesheet_id', id)
    const signedIds = (existingSignatures || []).map((s: { signer_id: string }) => s.signer_id)

    // If user has already signed, treat as success (idempotent - e.g. double-click or stale UI)
    if (signedIds.includes(user.id)) {
      return NextResponse.redirect(new URL(getSafeReturnTo(request, formData), request.url))
    }

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

    // Create signature - snapshot signer_name so it doesn't change if user profile is updated later
    const signerName = user.profile?.name || 'Unknown'
    const { error: signatureError } = await adminSupabase
      .from('timesheet_signatures')
      .insert({
        timesheet_id: id,
        signer_id: user.id,
        signer_role: signerRole,
        signer_name: signerName,
      })

    if (signatureError) {
      if (signatureError.code === '23505' || signatureError.message?.includes('duplicate key')) {
        // Already signed (e.g. auto-approve ran, or double-click) - redirect as success
        return NextResponse.redirect(new URL(getSafeReturnTo(request, formData), request.url))
      }
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

    const { error: updateError } = await adminSupabase
      .from('weekly_timesheets')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL(getSafeReturnTo(request, formData), request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
