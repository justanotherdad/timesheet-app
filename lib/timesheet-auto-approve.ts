/**
 * Auto-approve / finalize timesheets when approval is complete:
 * - empty profile chain (no one is assigned above the employee), or
 * - every assigned profile-chain member has already signed (heals short chains
 *   that previously stayed "submitted" after the last assigned approver).
 *
 * An empty chain still marks the timesheet approved. It does not record the
 * employee as the final approver.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getRequiredBudgetApproverIds,
  isBudgetStageComplete,
} from '@/lib/budget-timesheet-approvers'
import { nextApprovalConfirmationSequence } from '@/lib/timesheet-confirmation'

/** Ordered approvers: first line (supervisor or reports-to) → manager → final. Exported for approve/delegate logic. */
export function buildApprovalChain(profile: {
  reports_to_id?: string | null
  supervisor_id?: string | null
  manager_id?: string | null
  final_approver_id?: string | null
} | null): string[] {
  if (!profile) return []
  const chain: string[] = []
  const firstApprover = profile.supervisor_id || profile.reports_to_id
  if (firstApprover) chain.push(firstApprover)
  if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
  if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
  return chain
}

async function markTimesheetApproved(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  timesheetId: string,
  approvedById: string,
  prevSeq: number | undefined
): Promise<boolean> {
  const { error } = await adminSupabase
    .from('weekly_timesheets')
    .update({
      status: 'approved',
      approved_by_id: approvedById,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      approval_confirmation_sequence: nextApprovalConfirmationSequence(prevSeq),
    })
    .eq('id', timesheetId)
  return !error
}

/**
 * Finalize a submitted timesheet when no further approvers remain.
 * Returns true if the timesheet was (or already is effectively) approved.
 */
export async function checkAndAutoApproveIfFinal(timesheetId: string): Promise<boolean> {
  const adminSupabase = createAdminClient()

  const { data: timesheet, error: fetchError } = await adminSupabase
    .from('weekly_timesheets')
    .select('*, user_profiles!user_id(reports_to_id, manager_id, supervisor_id, final_approver_id)')
    .eq('id', timesheetId)
    .single()

  if (fetchError || !timesheet || timesheet.status !== 'submitted') {
    return false
  }

  const profile = timesheet.user_profiles as {
    reports_to_id?: string
    supervisor_id?: string
    manager_id?: string
    final_approver_id?: string
  } | null

  const chain = buildApprovalChain(profile)

  // Budget "Timesheet approver" stage must be finished (or empty) first.
  const budgetRequired = await getRequiredBudgetApproverIds(
    adminSupabase,
    timesheetId,
    timesheet.user_id,
    profile
  )
  const { data: existingSigs } = await adminSupabase
    .from('timesheet_signatures')
    .select('signer_id')
    .eq('timesheet_id', timesheetId)
  const signedIds = new Set((existingSigs || []).map((s: { signer_id: string }) => s.signer_id))
  if (!isBudgetStageComplete(budgetRequired, signedIds)) return false

  const prevSeq = (timesheet as { approval_confirmation_sequence?: number }).approval_confirmation_sequence

  // Short / completed chain: all assigned profile approvers have signed.
  if (chain.length > 0) {
    if (!chain.every((id) => signedIds.has(id))) return false
    const approvedById = chain[chain.length - 1]
    return markTimesheetApproved(adminSupabase, timesheetId, approvedById, prevSeq)
  }

  // Empty chain: nobody is assigned above this employee. Approve the timesheet
  // without writing a final-approver signature for the employee.
  return markTimesheetApproved(adminSupabase, timesheetId, timesheet.user_id, prevSeq)
}
