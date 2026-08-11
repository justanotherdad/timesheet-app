import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getWorkflowApprovalTimesheets,
  sortWorkflowApprovals,
} from '@/lib/approval-queue'
import { describeApprovalWith } from '@/lib/approval-with-display'
import {
  getRequiredBudgetApproverIdsByTimesheet,
  getBudgetApproverPoNumbersByTimesheet,
  formatBudgetApproverDisplayName,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { buildApproverDisplayNamesByNextId } from '@/lib/approval-delegation-display'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { getTimesheetHourTotalsForApproverViewer } from '@/lib/timesheet-hour-totals'
import Header from '@/components/Header'
import PendingApprovalsClient from './PendingApprovalsClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

type SearchParams = { sort?: string; dir?: string }

export default async function ApprovalsPage(props: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(APPROVAL_PARTICIPANT_ROLES)
  const params = await props.searchParams
  const sortBy = params.sort || 'user'
  const sortDir = (params.dir || 'asc') as 'asc' | 'desc'

  const adminSupabase = createAdminClient()
  let timesheets = sortWorkflowApprovals(
    await getWorkflowApprovalTimesheets(user),
    sortBy,
    sortDir
  )

  const awaitingCount = timesheets.filter((t) => t.awaitingMyApproval).length
  const inWorkflowCount = timesheets.length

  const withLabelByTimesheetId: Record<string, string> = {}
  const withPersonByTimesheetId: Record<string, string> = {}

  if (timesheets.length > 0) {
    const meta = timesheets.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      user_profiles: ts.user_profiles as ApprovalProfileFields,
    }))
    const requiredMap = await getRequiredBudgetApproverIdsByTimesheet(adminSupabase, meta)
    const poNumsByTs = await getBudgetApproverPoNumbersByTimesheet(adminSupabase, meta)
    const { data: sigs } = await adminSupabase
      .from('timesheet_signatures')
      .select('timesheet_id, signer_id')
      .in(
        'timesheet_id',
        timesheets.map((t: { id: string }) => t.id)
      )
    const signedByTimesheet: Record<string, Set<string>> = {}
    for (const s of sigs || []) {
      if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
      signedByTimesheet[s.timesheet_id].add(s.signer_id)
    }

    const nameIds = new Set<string>()
    for (const ts of timesheets) {
      const profile = ts.user_profiles as ApprovalProfileFields | undefined
      const withInfo = describeApprovalWith(
        requiredMap[ts.id] || [],
        profile || null,
        signedByTimesheet[ts.id] || new Set(),
        {}
      )
      if (withInfo.stage.kind === 'budget') {
        withInfo.stage.pendingIds.forEach((id) => nameIds.add(id))
      } else if (withInfo.stage.kind === 'profile') {
        nameIds.add(withInfo.stage.nextId)
      }
      for (const uid of Object.keys(poNumsByTs[ts.id] || {})) nameIds.add(uid)
    }

    const approverNamesById =
      nameIds.size > 0
        ? await buildApproverDisplayNamesByNextId(
            adminSupabase,
            [...nameIds],
            getCalendarDateStringInAppTimezone()
          )
        : {}

    for (const ts of timesheets) {
      const profile = ts.user_profiles as ApprovalProfileFields | undefined
      const poByUser = poNumsByTs[ts.id] || {}
      const budgetDisplay: Record<string, string> = {}
      for (const [uid, nums] of Object.entries(poByUser)) {
        budgetDisplay[uid] = formatBudgetApproverDisplayName(
          approverNamesById[uid] || 'Unknown',
          nums
        )
      }
      const withInfo = describeApprovalWith(
        requiredMap[ts.id] || [],
        profile || null,
        signedByTimesheet[ts.id] || new Set(),
        { approverNamesById, budgetDisplayByUserId: budgetDisplay }
      )
      withLabelByTimesheetId[ts.id] = withInfo.label
      withPersonByTimesheetId[ts.id] = withInfo.person
    }
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
      <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {timesheets.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
              <p className="text-gray-600 dark:text-gray-300">No timesheets in your approval workflow.</p>
            </div>
          ) : (
            <PendingApprovalsClient
              timesheets={timesheets}
              sortBy={sortBy}
              sortDir={sortDir}
              withLabelByTimesheetId={withLabelByTimesheetId}
              withPersonByTimesheetId={withPersonByTimesheetId}
              hourTotals={hourTotals}
              awaitingCount={awaitingCount}
              inWorkflowCount={inWorkflowCount}
            />
          )}
        </div>
      </div>
    </div>
  )
}
