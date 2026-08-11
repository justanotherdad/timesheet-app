import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import { buildApproverDisplayNamesByNextId } from '@/lib/approval-delegation-display'
import { getApprovedTimesheetsForViewer } from '@/lib/approved-timesheets-query'
import { describeApprovalWith } from '@/lib/approval-with-display'
import {
  getRequiredBudgetApproverIdsByTimesheet,
  getBudgetApproverPoNumbersByTimesheet,
  formatBudgetApproverDisplayName,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import { getTimesheetHourTotalsForApproverViewer } from '@/lib/timesheet-hour-totals'
import Header from '@/components/Header'
import ApprovedTimesheetsClient from './ApprovedTimesheetsClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

type SearchParams = { user?: string; start?: string; end?: string; sort?: string; dir?: string }

export default async function ApprovedTimesheetsPage(props: { searchParams: Promise<SearchParams> }) {
  const { searchParams } = props
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin', 'client'])
  const params = await searchParams
  const filterUser = params.user || ''
  const filterStart = params.start || ''
  const filterEnd = params.end || ''
  const sortBy = params.sort || 'week_ending'
  const sortDir = (params.dir || 'desc') as 'asc' | 'desc'
  const isClient = user.profile.role === 'client'

  const adminSupabase = createAdminClient()

  let timesheets = await getApprovedTimesheetsForViewer(user, {
    filterUser,
    filterStart,
    filterEnd,
  })

  // Auto-approve submitted timesheets where employee has no approvers left
  const submittedInList = timesheets.filter((ts: any) => ts.status === 'submitted')
  if (submittedInList.length > 0) {
    const autoApproved = await Promise.all(
      submittedInList.map((ts: any) => checkAndAutoApproveIfFinal(ts.id))
    )
    if (autoApproved.some(Boolean)) {
      const ids = timesheets.map((t: any) => t.id)
      const { data: refetched } = await adminSupabase
        .from('weekly_timesheets')
        .select(
          '*, user_profiles!user_id(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)'
        )
        .in('id', ids)
      const refetchedMap = new Map((refetched || []).map((ts: any) => [ts.id, ts]))
      timesheets = timesheets.map((ts: any) => refetchedMap.get(ts.id) || ts)
    }
  }

  const signaturesByTimesheetId: Record<string, string[]> = {}
  const withLabelByTimesheetId: Record<string, string> = {}
  const withPersonByTimesheetId: Record<string, string> = {}
  let approverNamesById: Record<string, string> = {}

  if (timesheets.length > 0) {
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in(
          'timesheet_id',
          timesheets.map((t) => t.id)
        )
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signaturesByTimesheetId[s.timesheet_id]) signaturesByTimesheetId[s.timesheet_id] = []
      signaturesByTimesheetId[s.timesheet_id].push(s.signer_id)
    })

    const submitted = timesheets.filter((ts: any) => ts.status === 'submitted')
    const submittedMeta = submitted.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      user_profiles: ts.user_profiles as ApprovalProfileFields,
    }))
    const requiredByTs = await getRequiredBudgetApproverIdsByTimesheet(adminSupabase, submittedMeta)
    const poNumsByTs = await getBudgetApproverPoNumbersByTimesheet(adminSupabase, submittedMeta)

    const nextApproverIds = new Set<string>()
    for (const ts of submitted) {
      const signedIds = signaturesByTimesheetId[ts.id] || []
      const profile = ts.user_profiles as ApprovalProfileFields | undefined
      const withInfo = describeApprovalWith(requiredByTs[ts.id] || [], profile, signedIds, {})
      if (withInfo.stage.kind === 'budget') {
        withInfo.stage.pendingIds.forEach((id) => nextApproverIds.add(id))
      } else if (withInfo.stage.kind === 'profile') {
        nextApproverIds.add(withInfo.stage.nextId)
      }
      for (const uid of Object.keys(poNumsByTs[ts.id] || {})) nextApproverIds.add(uid)
    }

    if (nextApproverIds.size > 0) {
      approverNamesById = await buildApproverDisplayNamesByNextId(
        adminSupabase,
        [...nextApproverIds],
        getCalendarDateStringInAppTimezone()
      )
    }

    for (const ts of submitted) {
      const profile = ts.user_profiles as ApprovalProfileFields | undefined
      const signedIds = signaturesByTimesheetId[ts.id] || []
      const poByUser = poNumsByTs[ts.id] || {}
      const budgetDisplay: Record<string, string> = {}
      for (const [uid, nums] of Object.entries(poByUser)) {
        budgetDisplay[uid] = formatBudgetApproverDisplayName(
          approverNamesById[uid] || 'Unknown',
          nums
        )
      }
      const withInfo = describeApprovalWith(requiredByTs[ts.id] || [], profile, signedIds, {
        approverNamesById,
        budgetDisplayByUserId: budgetDisplay,
      })
      withLabelByTimesheetId[ts.id] = withInfo.label
      withPersonByTimesheetId[ts.id] = withInfo.person
    }
  }

  // Sort
  const orderAsc = sortDir === 'asc'
  const sortFn = (a: any, b: any) => {
    let cmp = 0
    if (sortBy === 'week_ending') {
      cmp = (a.week_ending || '').localeCompare(b.week_ending || '')
      if (cmp === 0) {
        cmp = (a.user_profiles?.name || '')
          .toLowerCase()
          .localeCompare((b.user_profiles?.name || '').toLowerCase())
        return cmp
      }
    } else if (sortBy === 'week_starting') {
      cmp = (a.week_starting || '').localeCompare(b.week_starting || '')
    } else if (sortBy === 'created_at') {
      cmp = (a.created_at || '').localeCompare(b.created_at || '')
    } else if (sortBy === 'status') {
      cmp = (a.status || '').localeCompare(b.status || '')
    } else if (sortBy === 'user') {
      cmp = (a.user_profiles?.name || '')
        .toLowerCase()
        .localeCompare((b.user_profiles?.name || '').toLowerCase())
    } else {
      const aVal = a.approved_at || a.submitted_at || a.created_at || ''
      const bVal = b.approved_at || b.submitted_at || b.created_at || ''
      cmp = aVal.localeCompare(bVal)
    }
    return orderAsc ? cmp : -cmp
  }
  timesheets = [...timesheets].sort(sortFn)

  // Filter dropdown
  let filterUsers: { id: string; name: string }[] = []
  if (isClient) {
    const byId = new Map<string, string>()
    for (const ts of timesheets) {
      const uid = ts.user_id as string
      const name = (ts.user_profiles?.name || 'Unknown') as string
      if (uid && !byId.has(uid)) byId.set(uid, name)
    }
    filterUsers = [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } else {
    const reportsForFilterRes = await withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('id, name')
        .or(
          `reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`
        )
    )
    const reportsForFilter = (reportsForFilterRes.data || []) as { id: string; name: string }[]
    const selfRes = await withQueryTimeout(() =>
      adminSupabase.from('user_profiles').select('id, name').eq('id', user.id).single()
    )
    const self = selfRes.data as { id: string; name: string } | null
    // Include employees from signed sheets so budget-only approvers can filter
    const fromSheets = new Map<string, string>()
    for (const ts of timesheets) {
      if (ts.user_id && ts.user_profiles?.name) {
        fromSheets.set(ts.user_id, ts.user_profiles.name)
      }
    }
    const merged = new Map<string, string>()
    if (self) merged.set(self.id, self.name)
    for (const r of reportsForFilter) merged.set(r.id, r.name)
    for (const [id, name] of fromSheets) merged.set(id, name)
    filterUsers = [...merged.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const hourTotals = await getTimesheetHourTotalsForApproverViewer(
    adminSupabase,
    timesheets.map((t: any) => ({
      id: t.id,
      user_id: t.user_id,
      user_profiles: t.user_profiles,
    })),
    { id: user.id, role: user.profile.role }
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Approved Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <ApprovedTimesheetsClient
            timesheets={timesheets}
            filterUsers={filterUsers}
            filterUser={filterUser}
            filterStart={filterStart}
            filterEnd={filterEnd}
            sortBy={sortBy}
            sortDir={sortDir}
            signaturesByTimesheetId={signaturesByTimesheetId}
            approverNamesById={approverNamesById}
            withLabelByTimesheetId={withLabelByTimesheetId}
            withPersonByTimesheetId={withPersonByTimesheetId}
            userRole={user.profile.role}
            hourTotals={hourTotals}
          />
        </div>
      </div>
    </div>
  )
}
