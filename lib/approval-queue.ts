import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import {
  getRequiredBudgetApproverIdsByTimesheet,
  resolveApprovalStage,
  userIsCurrentApprover,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PendingTimesheet = any

/**
 * Returns the *filtered, unsorted* list of timesheets currently awaiting this
 * user's approval (mirrors the logic on the Pending Approvals page, including
 * delegation handling and the parallel budget-approver stage).
 */
export async function getPendingApprovalTimesheets(user: {
  id: string
}): Promise<PendingTimesheet[]> {
  const adminSupabase = createAdminClient()
  const today = getCalendarDateStringInAppTimezone()

  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(
        `reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`
      )
  )

  let reports = (reportsResult.data || []) as Array<{ id: string }>

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

  // Timesheets where this user (or someone they hold delegation for) is a
  // budget timesheet-approver on a charged PO — may not appear in profile reports.
  const budgetGrantUserIds = [user.id, ...delegatorIds]
  const { data: budgetAccessRows } = await adminSupabase
    .from('po_budget_access')
    .select('purchase_order_id')
    .in('user_id', budgetGrantUserIds)
    .eq('timesheet_approver', true)
  const budgetPoIds = [...new Set((budgetAccessRows || []).map((r: any) => r.purchase_order_id).filter(Boolean))]

  let budgetCandidateTimesheetIds: string[] = []
  if (budgetPoIds.length > 0) {
    const { data: entryRows } = await adminSupabase
      .from('timesheet_entries')
      .select('timesheet_id, po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
      .in('po_id', budgetPoIds)
    const hoursByTsPo: Record<string, number> = {}
    for (const e of entryRows || []) {
      const hrs =
        Number(e.mon_hours || 0) +
        Number(e.tue_hours || 0) +
        Number(e.wed_hours || 0) +
        Number(e.thu_hours || 0) +
        Number(e.fri_hours || 0) +
        Number(e.sat_hours || 0) +
        Number(e.sun_hours || 0)
      if (hrs <= 0 || !e.timesheet_id) continue
      const key = `${e.timesheet_id}`
      hoursByTsPo[key] = (hoursByTsPo[key] || 0) + hrs
    }
    budgetCandidateTimesheetIds = Object.keys(hoursByTsPo)
  }

  const reportIds = reports.map((r) => r.id)
  if (reportIds.length === 0 && budgetCandidateTimesheetIds.length === 0) return []

  let profileSubmitted: any[] = []
  if (reportIds.length > 0) {
    const timesheetsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select(
          `*, user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)`
        )
        .in('user_id', reportIds)
        .eq('status', 'submitted')
    )
    profileSubmitted = (timesheetsResult.data || []) as any[]
  }

  let budgetSubmitted: any[] = []
  if (budgetCandidateTimesheetIds.length > 0) {
    const budgetTsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select(
          `*, user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)`
        )
        .in('id', budgetCandidateTimesheetIds)
        .eq('status', 'submitted')
    )
    budgetSubmitted = (budgetTsResult.data || []) as any[]
  }

  const byId = new Map<string, any>()
  for (const ts of profileSubmitted) byId.set(ts.id, ts)
  for (const ts of budgetSubmitted) byId.set(ts.id, ts)
  const allSubmitted = [...byId.values()]
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

  const requiredByTimesheet = await getRequiredBudgetApproverIdsByTimesheet(
    adminSupabase,
    allSubmitted.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      user_profiles: ts.user_profiles as ApprovalProfileFields,
    }))
  )

  return allSubmitted.filter((ts: any) => {
    const profile = ts.user_profiles as ApprovalProfileFields
    const signedIds = signedByTimesheet[ts.id] || new Set<string>()
    const requiredBudget = requiredByTimesheet[ts.id] || []
    const stage = resolveApprovalStage(requiredBudget, profile, signedIds)

    if (stage.kind === 'done') return false

    // Self as current actor
    if (userIsCurrentApprover(stage, user.id)) {
      if (hasOutgoingDelegation) return false
      return true
    }

    // Acting via delegation for a current actor
    if (stage.kind === 'budget') {
      return stage.pendingIds.some((id) => delegatedByIds.has(id))
    }
    return !!stage.nextId && delegatedByIds.has(stage.nextId)
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
