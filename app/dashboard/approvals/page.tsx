import { APPROVAL_PARTICIPANT_ROLES } from '@/lib/approval-access'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingApprovalTimesheets, sortPendingApprovals } from '@/lib/approval-queue'
import {
  getRequiredBudgetApproverIdsByTimesheet,
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

  // With label based on current user's position for the first row (budget vs profile role)
  let withLabel = 'With Approver'
  const firstTs = timesheets[0]
  if (firstTs) {
    const profile = firstTs.user_profiles as ApprovalProfileFields | undefined
    const requiredMap = await getRequiredBudgetApproverIdsByTimesheet(adminSupabase, [
      {
        id: firstTs.id,
        user_id: firstTs.user_id,
        user_profiles: profile,
      },
    ])
    const { data: sigs } = await adminSupabase
      .from('timesheet_signatures')
      .select('signer_id')
      .eq('timesheet_id', firstTs.id)
    const signedIds = new Set((sigs || []).map((s: { signer_id: string }) => s.signer_id))
    const stage = resolveApprovalStage(requiredMap[firstTs.id] || [], profile || null, signedIds)
    if (stage.kind === 'budget') {
      withLabel = 'With Budget Approver'
    } else if (profile) {
      if (user.id === profile.supervisor_id || user.id === profile.reports_to_id) withLabel = 'With Supervisor'
      else if (user.id === profile.manager_id) withLabel = 'With Manager'
      else if (user.id === profile.final_approver_id) withLabel = 'With Final Approver'
    }
  }

  const currentUserName = user.profile.name || 'You'

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
              currentUserName={currentUserName}
              withLabel={withLabel}
              hourTotals={hourTotals}
            />
          )}
        </div>
      </div>
    </div>
  )
}
