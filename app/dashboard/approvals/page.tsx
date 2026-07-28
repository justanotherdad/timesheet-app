import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingApprovalTimesheets, sortPendingApprovals } from '@/lib/approval-queue'
import {
  getRequiredBudgetApproverIdsByTimesheet,
  getBudgetApproverPoNumbersByTimesheet,
  formatBudgetApproverDisplayName,
  resolveApprovalStage,
  type ApprovalProfileFields,
} from '@/lib/budget-timesheet-approvers'
import { getTimesheetHourTotals } from '@/lib/timesheet-hour-totals'
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
  let timesheets = sortPendingApprovals(await getPendingApprovalTimesheets(user), sortBy, sortDir)

  const withLabelByTimesheetId: Record<string, string> = {}
  const withPersonByTimesheetId: Record<string, string> = {}
  const defaultName = user.profile.name || 'You'

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

    for (const ts of timesheets) {
      const profile = ts.user_profiles as ApprovalProfileFields | undefined
      const stage = resolveApprovalStage(
        requiredMap[ts.id] || [],
        profile || null,
        signedByTimesheet[ts.id] || new Set()
      )
      if (stage.kind === 'budget') {
        withLabelByTimesheetId[ts.id] =
          stage.pendingIds.length > 1 ? 'With Budget Approvers' : 'With Budget Approver'
        const poNums = poNumsByTs[ts.id]?.[user.id] || []
        // If acting via delegation for a budget pending person, use that person's POs
        let displayUserId = user.id
        let displayName = defaultName
        if (!stage.pendingIds.includes(user.id)) {
          const delegatedPending = stage.pendingIds[0]
          if (delegatedPending) {
            displayUserId = delegatedPending
            const { data: p } = await adminSupabase
              .from('user_profiles')
              .select('name')
              .eq('id', delegatedPending)
              .maybeSingle()
            displayName = p?.name || defaultName
          }
        }
        const nums = poNumsByTs[ts.id]?.[displayUserId] || poNums
        withPersonByTimesheetId[ts.id] = formatBudgetApproverDisplayName(displayName, nums)
      } else if (profile) {
        if (user.id === profile.supervisor_id || user.id === profile.reports_to_id) {
          withLabelByTimesheetId[ts.id] = 'With Supervisor'
        } else if (user.id === profile.manager_id) {
          withLabelByTimesheetId[ts.id] = 'With Manager'
        } else if (user.id === profile.final_approver_id) {
          withLabelByTimesheetId[ts.id] = 'With Final Approver'
        } else {
          withLabelByTimesheetId[ts.id] = 'With Approver'
        }
        withPersonByTimesheetId[ts.id] = defaultName
      } else {
        withLabelByTimesheetId[ts.id] = 'With Approver'
        withPersonByTimesheetId[ts.id] = defaultName
      }
    }
  }

  const hourTotals = await getTimesheetHourTotals(
    adminSupabase,
    timesheets.map((t: { id: string }) => t.id)
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {timesheets.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
              <p className="text-gray-600 dark:text-gray-300">No pending approvals.</p>
            </div>
          ) : (
            <PendingApprovalsClient
              timesheets={timesheets}
              sortBy={sortBy}
              sortDir={sortDir}
              withLabelByTimesheetId={withLabelByTimesheetId}
              withPersonByTimesheetId={withPersonByTimesheetId}
              hourTotals={hourTotals}
            />
          )}
        </div>
      </div>
    </div>
  )
}
