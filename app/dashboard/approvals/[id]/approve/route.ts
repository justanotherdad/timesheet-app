import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import {
  getRequiredBudgetApproverIds,
  resolveApprovalStage,
  formatBudgetApproverDisplayName,
  getBudgetApproverPoNumbersForUser,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { nextApprovalConfirmationSequence } from '@/lib/timesheet-confirmation'
import { getPendingApprovalTimesheets, sortPendingApprovals } from '@/lib/approval-queue'
import { NextResponse } from 'next/server'

function getSafeReturnTo(request: Request, formData: FormData): string {
  const returnTo = formData.get('returnTo') as string | null
  return returnTo &&
    returnTo.startsWith('/dashboard/approvals') &&
    !returnTo.includes('//')
    ? returnTo
    : '/dashboard/approvals'
}

function wantsJsonResponse(request: Request): boolean {
  return (request.headers.get('accept') || '').includes('application/json')
}

/**
 * Resolves where to go after a successful approval. When the caller requests
 * `advance` (the timesheet detail "Approve" button stepping through the queue),
 * we compute the *fresh* pending queue AFTER this approval was written and
 * return a detail URL for the next one.
 */
async function resolveReturnTo(
  request: Request,
  formData: FormData,
  user: { id: string },
  justApprovedId: string
): Promise<string> {
  const base = getSafeReturnTo(request, formData)
  if ((formData.get('advance') as string | null) !== '1') return base

  let sortBy = 'user'
  let sortDir: 'asc' | 'desc' = 'asc'
  const qIndex = base.indexOf('?')
  if (qIndex >= 0) {
    const sp = new URLSearchParams(base.slice(qIndex + 1))
    sortBy = sp.get('sort') || 'user'
    sortDir = (sp.get('dir') || 'asc') === 'desc' ? 'desc' : 'asc'
  }
  try {
    const queue = sortPendingApprovals(await getPendingApprovalTimesheets(user), sortBy, sortDir)
    const idx = queue.findIndex((t: { id: string }) => t.id === justApprovedId)
    const next = idx >= 0 ? queue[idx + 1] : queue.find((t: { id: string }) => t.id !== justApprovedId)
    if (next) return `/dashboard/timesheets/${next.id}?returnTo=${encodeURIComponent(base)}`
  } catch {
    /* fall back to the list */
  }
  return base
}

async function approvalSuccess(
  request: Request,
  formData: FormData,
  wantsJson: boolean,
  user: { id: string },
  justApprovedId: string
) {
  const path = await resolveReturnTo(request, formData, user, justApprovedId)
  if (wantsJson) return NextResponse.json({ ok: true as const, returnTo: path })
  return NextResponse.redirect(new URL(path, request.url))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const formData = await request.formData()
    const wantsJson = wantsJsonResponse(request)
    const user = await requireRole(APPROVAL_PARTICIPANT_ROLES)
    const adminSupabase = createAdminClient()
    const { id } = await params

    const { data: timesheet, error: fetchError } = await adminSupabase
      .from('weekly_timesheets')
      .select('*, user_profiles!user_id(manager_id, supervisor_id, reports_to_id, final_approver_id)')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const profile = timesheet.user_profiles as ApprovalProfileFields

    if (timesheet.status !== 'submitted' && !['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Timesheet is not in submitted status' }, { status: 400 })
    }

    const { data: existingSignatures } = await adminSupabase
      .from('timesheet_signatures')
      .select('signer_id, signer_role')
      .eq('timesheet_id', id)
    const signedIds = (existingSignatures || []).map((s: { signer_id: string }) => s.signer_id)

    if (signedIds.includes(user.id)) {
      return approvalSuccess(request, formData, wantsJson, user, id)
    }

    const requiredBudget = await getRequiredBudgetApproverIds(
      adminSupabase,
      id,
      timesheet.user_id,
      profile
    )
    const stage = resolveApprovalStage(requiredBudget, profile, signedIds)
    const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)
    const today = getCalendarDateStringInAppTimezone()

    let canApprove = false
    let actingForId: string | null = null
    let delegationForDelegate: { include_delegation_note_in_approval?: boolean } | null = null

    if (isAdmin) {
      canApprove = true
    } else if (stage.kind === 'budget') {
      if (stage.pendingIds.includes(user.id)) {
        const delegatedAway = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)
        canApprove = !delegatedAway
        actingForId = user.id
      } else {
        for (const pendingId of stage.pendingIds) {
          const { data: activeDelegation } = await adminSupabase
            .from('approval_delegations')
            .select('id, include_delegation_note_in_approval')
            .eq('delegator_id', pendingId)
            .eq('delegate_id', user.id)
            .lte('start_date', today)
            .gte('end_date', today)
            .limit(1)
            .maybeSingle()
          if (activeDelegation) {
            canApprove = true
            actingForId = pendingId
            delegationForDelegate = activeDelegation
            break
          }
        }
      }
    } else if (stage.kind === 'profile') {
      const nextApproverId = stage.nextId
      if (nextApproverId === user.id) {
        const delegatedAway = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)
        canApprove = !delegatedAway
        actingForId = user.id
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
        if (canApprove) actingForId = nextApproverId
      }
    }

    if (!canApprove) {
      return NextResponse.json(
        { error: 'You are not the next approver in line for this timesheet.' },
        { status: 403 }
      )
    }

    // Admins always sign as themselves. If admin acts during budget stage, treat as
    // final (existing shortcut). If admin acts during profile and is final, same.
    const actingAsDelegate =
      !isAdmin && !!actingForId && actingForId !== user.id && canApprove
    const signerId = isAdmin ? user.id : actingAsDelegate ? actingForId! : user.id

    let signerRole: 'budget_approver' | 'manager' | 'supervisor' | 'final_approver'
    if (isAdmin) {
      signerRole = 'final_approver'
    } else if (stage.kind === 'budget') {
      signerRole = 'budget_approver'
    } else if (signerId === profile?.final_approver_id) {
      signerRole = 'final_approver'
    } else if (signerId === profile?.manager_id) {
      signerRole = 'manager'
    } else {
      signerRole = 'supervisor'
    }

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
    if (signerRole === 'budget_approver') {
      const poNumbers = await getBudgetApproverPoNumbersForUser(
        adminSupabase,
        id,
        timesheet.user_id,
        profile,
        signerId
      )
      signerName = formatBudgetApproverDisplayName(signerName, poNumbers)
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
        return approvalSuccess(request, formData, wantsJson, user, id)
      }
      return NextResponse.json({ error: signatureError.message }, { status: 500 })
    }

    const isFinalApproval = signerRole === 'final_approver'
    const updateData: Record<string, unknown> = {
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

    // After the last budget approver signs, empty profile chain should auto-approve.
    if (!isFinalApproval && stage.kind === 'budget') {
      const signedAfter = new Set([...signedIds, signerId])
      const stageAfter = resolveApprovalStage(requiredBudget, profile, signedAfter)
      if (stageAfter.kind === 'done') {
        await checkAndAutoApproveIfFinal(id)
      }
    }

    return approvalSuccess(request, formData, wantsJson, user, id)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
