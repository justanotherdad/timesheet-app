import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PendingTimesheet = any

/**
 * Returns the *filtered, unsorted* list of timesheets currently awaiting this
 * user's approval (mirrors the logic on the Pending Approvals page, including
 * delegation handling). Extracted so the approvals list and the timesheet
 * detail page (Next/Previous navigation) share one source of truth.
 */
export async function getPendingApprovalTimesheets(user: {
  id: string
}): Promise<PendingTimesheet[]> {
  const adminSupabase = createAdminClient()

  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(
        `reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`
      )
  )

  let reports = (reportsResult.data || []) as Array<{ id: string }>

  const today = getCalendarDateStringInAppTimezone()
  const { data: delegationRows } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', user.id)
    .lte('start_date', today)
    .gte('end_date', today)
  const delegatorIds = [...new Set((delegationRows || []).map((r: any) => r.delegator_id))]
  const delegatedByIds = new Set(delegatorIds)
  const hasOutgoingDelegation = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)
  if (delegatorIds.length > 0) {
    const seen = new Set(reports.map((r) => r.id))
    for (const delegatorId of delegatorIds) {
      const delegatorReportsResult = await withQueryTimeout(() =>
        adminSupabase
          .from('user_profiles')
          .select('id')
          .or(
            `reports_to_id.eq.${delegatorId},supervisor_id.eq.${delegatorId},manager_id.eq.${delegatorId},final_approver_id.eq.${delegatorId}`
          )
      )
      const delegatorReports = (delegatorReportsResult.data || []) as Array<{ id: string }>
      for (const r of delegatorReports) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          reports = [...reports, r]
        }
      }
    }
  }

  if (!reports || reports.length === 0) return []

  const reportIds = reports.map((r) => r.id)

  const timesheetsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('weekly_timesheets')
      .select(
        `*, user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)`
      )
      .in('user_id', reportIds)
      .eq('status', 'submitted')
  )

  const allSubmitted = (timesheetsResult.data || []) as any[]
  if (allSubmitted.length === 0) return []

  const sigResult = await withQueryTimeout(() =>
    adminSupabase
      .from('timesheet_signatures')
      .select('timesheet_id, signer_id')
      .in('timesheet_id', allSubmitted.map((t: any) => t.id))
  )
  const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
  const signedByTimesheet: Record<string, Set<string>> = {}
  sigs.forEach((s) => {
    if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
    signedByTimesheet[s.timesheet_id].add(s.signer_id)
  })

  return allSubmitted.filter((ts: any) => {
    const profile = ts.user_profiles as {
      reports_to_id?: string
      supervisor_id?: string
      manager_id?: string
      final_approver_id?: string
    }
    const chain: string[] = []
    const firstApprover = profile?.supervisor_id || profile?.reports_to_id
    if (firstApprover) chain.push(firstApprover)
    if (profile?.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
    if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
    const signedIds = signedByTimesheet[ts.id] || new Set<string>()
    const nextId = chain.find((uid) => !signedIds.has(uid))
    if (nextId === user.id && hasOutgoingDelegation) return false
    return nextId === user.id || (!!nextId && delegatedByIds.has(nextId))
  })
}

/** Sort a pending-approval list the same way the Pending Approvals page does. */
export function sortPendingApprovals(
  list: PendingTimesheet[],
  sortBy: string,
  sortDir: 'asc' | 'desc'
): PendingTimesheet[] {
  const orderAsc = sortDir === 'asc'
  const sortFn = (a: any, b: any) => {
    let cmp = 0
    if (sortBy === 'week_ending') cmp = (a.week_ending || '').localeCompare(b.week_ending || '')
    else if (sortBy === 'week_starting') cmp = (a.week_starting || '').localeCompare(b.week_starting || '')
    else if (sortBy === 'created_at') cmp = (a.created_at || '').localeCompare(b.created_at || '')
    else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
    else if (sortBy === 'user')
      cmp = (a.user_profiles?.name || '').toLowerCase().localeCompare((b.user_profiles?.name || '').toLowerCase())
    else cmp = (a.submitted_at || a.created_at || '').localeCompare(b.submitted_at || b.created_at || '')
    return orderAsc ? cmp : -cmp
  }
  return [...list].sort(sortFn)
}
