/**
 * Auto-approve timesheets when the employee has no one in their approval chain
 * (e.g. final approver who doesn't report to anyone).
 */

import { createAdminClient } from '@/lib/supabase/admin'

function buildApprovalChain(profile: {
  reports_to_id?: string
  supervisor_id?: string
  manager_id?: string
  final_approver_id?: string
} | null): string[] {
  if (!profile) return []
  const chain: string[] = []
  const firstApprover = profile.supervisor_id || profile.reports_to_id
  if (firstApprover) chain.push(firstApprover)
  if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
  if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
  return chain
}

/**
 * If the timesheet's employee has an empty approval chain, auto-approve it.
 * Returns true if auto-approved, false otherwise.
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
  if (chain.length > 0) return false

  // Empty chain: no one to approve. Auto-approve as the employee approving themselves.
  const userId = timesheet.user_id

  const { error: signatureError } = await adminSupabase
    .from('timesheet_signatures')
    .insert({
      timesheet_id: timesheetId,
      signer_id: userId,
      signer_role: 'final_approver',
    })

  if (signatureError) return false

  const { error: updateError } = await adminSupabase
    .from('weekly_timesheets')
    .update({
      status: 'approved',
      approved_by_id: userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheetId)

  return !updateError
}
