import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import { buildApprovalChain } from '@/lib/timesheet-auto-approve'
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

export type WorkflowApprovalTimesheet = PendingTimesheet & {
  /** True when this user (or their active delegate cover) must act now. */
  awaitingMyApproval: boolean
}

const SUBMITTED_TIMESHEET_SELECT =
  '*, user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)'
/** PostgREST silently stops an unpaged select at about this many rows. */
const PAGE_SIZE = 1000
/** Keep `.in()` filters under the PostgREST URL length limit. */
const IN_CHUNK = 150

/**
 * Submitted timesheets still in workflow where this user is on the chain
 * (profile and/or budget), or covers someone on the chain via delegation,
 * and has not yet acted (own signature or signature recorded for a delegator
 * they cover). After signing, sheets leave this list (Approved Timesheets).
 *
 * Loads every in-flight submitted sheet, then keeps a row when this viewer is
 * on the profile chain or is a required budget approver (or covers someone who
 * is). Scanning historical entries on approver POs dropped sheets past the
 * first ~1000 rows.
 */
export async function getWorkflowApprovalTimesheets(user: {
  id: string
}): Promise<WorkflowApprovalTimesheet[]> {
  const adminSupabase = createAdminClient()
  const today = getCalendarDateStringInAppTimezone()

  const { data: delegationRows } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', user.id)
    .lte('start_date', today)
    .gte('end_date', today)
  const delegatedByIds = new Set<string>(
    (delegationRows || []).map((r: any) => r.delegator_id).filter(Boolean)
  )
  const hasOutgoingDelegation = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)

  const allSubmitted: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const pageResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select(SUBMITTED_TIMESHEET_SELECT)
        .eq('status', 'submitted')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
    )
    const rows = (pageResult.data || []) as any[]
    allSubmitted.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  if (allSubmitted.length === 0) return []

  const signedByTimesheet: Record<string, Set<string>> = {}
  const timesheetIds = allSubmitted.map((t: any) => t.id as string)
  for (let i = 0; i < timesheetIds.length; i += IN_CHUNK) {
    const chunk = timesheetIds.slice(i, i + IN_CHUNK)
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', chunk)
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
      signedByTimesheet[s.timesheet_id].add(s.signer_id)
    })
  }

  const requiredByTimesheet = await getRequiredBudgetApproverIdsByTimesheet(
    adminSupabase,
    allSubmitted.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      user_profiles: ts.user_profiles as ApprovalProfileFields,
    }))
  )

  const results: WorkflowApprovalTimesheet[] = []

  for (const ts of allSubmitted) {
    const profile = ts.user_profiles as ApprovalProfileFields
    const signedIds = signedByTimesheet[ts.id] || new Set<string>()
    const requiredBudget = requiredByTimesheet[ts.id] || []
    const stage = resolveApprovalStage(requiredBudget, profile, signedIds)

    if (stage.kind === 'done') continue

    const profileChain = buildApprovalChain(profile)
    const inChain =
      profileChain.includes(user.id) ||
      requiredBudget.includes(user.id) ||
      profileChain.some((id) => delegatedByIds.has(id)) ||
      requiredBudget.some((id) => delegatedByIds.has(id))

    if (!inChain) continue

    // Already acted: own signature, or a delegator we cover already signed.
    const alreadyActed =
      signedIds.has(user.id) || [...delegatedByIds].some((id) => signedIds.has(id))
    if (alreadyActed) continue

    let awaitingMyApproval = false
    if (userIsCurrentApprover(stage, user.id)) {
      awaitingMyApproval = !hasOutgoingDelegation
    } else if (stage.kind === 'budget') {
      awaitingMyApproval = stage.pendingIds.some((id) => delegatedByIds.has(id))
    } else if (stage.kind === 'profile') {
      awaitingMyApproval = !!stage.nextId && delegatedByIds.has(stage.nextId)
    }

    results.push({ ...ts, awaitingMyApproval })
  }

  return results
}

/**
 * Timesheets currently awaiting this user's approval (actionable only).
 * Used for badges and approve-and-advance queues.
 */
export async function getPendingApprovalTimesheets(user: {
  id: string
}): Promise<PendingTimesheet[]> {
  const workflow = await getWorkflowApprovalTimesheets(user)
  return workflow.filter((ts) => ts.awaitingMyApproval)
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

/**
 * Prefer actionable sheets first, then the shared column sort.
 */
export function sortWorkflowApprovals(
  list: WorkflowApprovalTimesheet[],
  sortBy: string,
  sortDir: 'asc' | 'desc'
): WorkflowApprovalTimesheet[] {
  const sorted = sortPendingApprovals(list, sortBy, sortDir) as WorkflowApprovalTimesheet[]
  return [...sorted].sort((a, b) => {
    if (a.awaitingMyApproval !== b.awaitingMyApproval) {
      return a.awaitingMyApproval ? -1 : 1
    }
    return 0
  })
}
