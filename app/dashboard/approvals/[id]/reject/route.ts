import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { buildApprovalChain } from '@/lib/timesheet-auto-approve'
import {
  getRequiredBudgetApproverIds,
  resolveApprovalStage,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(APPROVAL_PARTICIPANT_ROLES)
    const adminSupabase = createAdminClient()
    const { id } = await params

    const { data: timesheet, error: fetchError } = await adminSupabase
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

    const ownerProfile = timesheet.user_profiles as ApprovalProfileFields & {
      email?: string
      name?: string
    }
    let canReject =
      ownerProfile?.reports_to_id === user.id ||
      ownerProfile?.supervisor_id === user.id ||
      ownerProfile?.manager_id === user.id ||
      ownerProfile?.final_approver_id === user.id ||
      timesheet.user_id === user.id ||
      ['admin', 'super_admin'].includes(user.profile.role)

    const requiredBudget = await getRequiredBudgetApproverIds(
      adminSupabase,
      id,
      timesheet.user_id,
      ownerProfile
    )
    const { data: existingSignatures } = await adminSupabase
      .from('timesheet_signatures')
      .select('signer_id')
      .eq('timesheet_id', id)
    const signedIds = new Set((existingSignatures || []).map((s: { signer_id: string }) => s.signer_id))
    const stage = resolveApprovalStage(requiredBudget, ownerProfile, signedIds)

    if (!canReject) {
      if (stage.kind === 'budget' && (stage.pendingIds.includes(user.id) || stage.requiredIds.includes(user.id))) {
        canReject = true
      }
    }

    if (!canReject) {
      const approverIds = [
        ...buildApprovalChain(ownerProfile),
        ...(stage.kind === 'budget' ? stage.pendingIds : []),
      ]
      const today = getCalendarDateStringInAppTimezone()
      for (const approverId of [...new Set(approverIds)]) {
        const { data: activeDelegation } = await adminSupabase
          .from('approval_delegations')
          .select('id')
          .eq('delegator_id', approverId)
          .eq('delegate_id', user.id)
          .lte('start_date', today)
          .gte('end_date', today)
          .limit(1)
          .maybeSingle()
        if (activeDelegation) {
          canReject = true
          break
        }
      }
    }

    if (!canReject) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const baseUrl = new URL(request.url).origin

    if (timesheet.status === 'rejected') {
      const queryParams = new URLSearchParams({
        email: ownerProfile?.email || '',
        reason: timesheet.rejection_reason || '',
        week_ending: timesheet.week_ending || '',
      })
      return NextResponse.redirect(new URL(`/dashboard/approvals/rejected?${queryParams.toString()}`, baseUrl))
    }

    if (!['submitted', 'approved'].includes(timesheet.status)) {
      return NextResponse.json({ error: 'Timesheet must be submitted or approved to reject' }, { status: 400 })
    }

    const formData = await request.formData()
    const note = (formData.get('reason') as string)?.trim() || 'No note provided'
    const rejectorName = (user.profile as { name?: string }).name || 'Approver'
    const rejectionReason = `Rejected by ${rejectorName}: ${note}`

    const { error: deleteError } = await adminSupabase
      .from('timesheet_signatures')
      .delete()
      .eq('timesheet_id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const updatePayload: Record<string, unknown> = {
      status: 'rejected',
      rejected_by_id: user.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
    }
    if (timesheet.status === 'approved') {
      updatePayload.approved_by_id = null
      updatePayload.approved_at = null
    }

    const { error: updateError } = await adminSupabase
      .from('weekly_timesheets')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const queryParams = new URLSearchParams({
      email: ownerProfile?.email || '',
      reason: rejectionReason,
      week_ending: timesheet.week_ending || '',
    })
    return NextResponse.redirect(new URL(`/dashboard/approvals/rejected?${queryParams.toString()}`, baseUrl))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
