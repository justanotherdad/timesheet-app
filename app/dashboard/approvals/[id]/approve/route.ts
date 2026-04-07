import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { buildApprovalChain } from '@/lib/timesheet-auto-approve'
import { nextApprovalConfirmationSequence } from '@/lib/timesheet-confirmation'
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
    const user = await requireRole(APPROVAL_PARTICIPANT_ROLES)
    const adminSupabase = createAdminClient()
    const { id } = await params

    // Use admin client so RLS does not block supervisors/managers from reading the employee's timesheet
    const { data: timesheet, error: fetchError } = await adminSupabase
      .from('weekly_timesheets')
      .select('*, user_profiles!user_id(manager_id, supervisor_id, reports_to_id, final_approver_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as {
      manager_id?: string
      supervisor_id?: string
      reports_to_id?: string
      final_approver_id?: string
    }
    // Must match approvals page, auto-approve, etc.: first approver is supervisor OR reports_to
    const chain = buildApprovalChain(profile)

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

    // If delegator has already signed (or user acting as self), treat as success (idempotent)
    if (signedIds.includes(user.id)) {
      return NextResponse.redirect(new URL(getSafeReturnTo(request, formData), request.url))
    }

    // Next approver is first in chain who hasn't signed; admins can always approve (treated as final)
    const nextApproverId = chain.find((uid) => !signedIds.includes(uid))
    const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)
    const today = getCalendarDateStringInAppTimezone()

    let canApprove = false
    let delegationForDelegate: { include_delegation_note_in_approval?: boolean } | null = null
    if (isAdmin) {
      canApprove = true
    } else if (nextApproverId !== undefined) {
      if (nextApproverId === user.id) {
        const delegatedAway = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)
        canApprove = !delegatedAway
      } else {
        const { data: activeDelegation } = await adminSupabase
          .from('approval_delegations')
          .select('id, include_delegation_note_in_approval')
          .eq('delegator_id', nextApproverId)
          .eq('delegate_id', user.id)
          .lte('start_date', today)
          .gte('end_date', today)
          .limit(1)
          .maybeSingle()
        delegationForDelegate = activeDelegation
        canApprove = !!activeDelegation
      }
    }

    if (!canApprove) {
      return NextResponse.json(
        { error: 'You are not the next approver in line for this timesheet.' },
        { status: 403 }
      )
    }

    // Admins always sign as themselves (name + id), not as the "next" chain person.
    const actingAsDelegate =
      !isAdmin && !!nextApproverId && nextApproverId !== user.id && canApprove
    const signerId = isAdmin ? user.id : actingAsDelegate ? nextApproverId : user.id

    // Determine signer role based on who is signing (delegator or self)
    let signerRole: 'manager' | 'supervisor' | 'final_approver'
    if (isAdmin || signerId === profile?.final_approver_id) {
      signerRole = 'final_approver'
    } else if (signerId === profile?.manager_id) {
      signerRole = 'manager'
    } else {
      signerRole = 'supervisor'
    }

    // Signer name: when acting as delegate, either delegator only or "Delegate (on behalf of Delegator)" if the delegation requests it
    let signerName = user.profile?.name || 'Unknown'
    if (actingAsDelegate) {
      const { data: signerProfile } = await adminSupabase.from('user_profiles').select('name').eq('id', signerId).single()
      const delegatorName = signerProfile?.name ?? 'Unknown'
      if (delegationForDelegate?.include_delegation_note_in_approval) {
        signerName = `${user.profile?.name || 'Unknown'} (on behalf of ${delegatorName})`
      } else {
        signerName = delegatorName
      }
    }
    const { error: signatureError } = await adminSupabase
      .from('timesheet_signatures')
      .insert({
        timesheet_id: id,
        signer_id: signerId,
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
      const prevSeq = (timesheet as { approval_confirmation_sequence?: number }).approval_confirmation_sequence
      updateData.status = 'approved'
      updateData.approved_by_id = user.id
      updateData.approved_at = new Date().toISOString()
      updateData.approval_confirmation_sequence = nextApprovalConfirmationSequence(prevSeq)
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
