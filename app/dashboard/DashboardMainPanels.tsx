import Link from 'next/link'
import { CheckCircle, Clock, FileText, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkflowApprovalTimesheets, sortWorkflowApprovals } from '@/lib/approval-queue'
import { getApprovedTimesheetsForViewer } from '@/lib/approved-timesheets-query'
import { withQueryTimeout } from '@/lib/timeout'
import { formatDate, formatWeekEnding, getCalendarDateStringInAppTimezone } from '@/lib/utils'
import type { CurrentUser } from '@/lib/auth'

export default async function DashboardMainPanels({
  user,
  isClient,
}: {
  user: CurrentUser
  isClient: boolean
}) {
  const role = user.profile.role
  const isSupervisorOrAbove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(role)
  const showApproved = isSupervisorOrAbove || isClient

  const privilegedApprover = isSupervisorOrAbove || isClient
  const adminSupabase = createAdminClient()
  const today = getCalendarDateStringInAppTimezone()

  const supabase = await createClient()
  const recentPromise = isClient
    ? Promise.resolve([] as any[])
    : withQueryTimeout(() =>
        supabase
          .from('weekly_timesheets')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)
      ).then((r) => (r.data || []) as any[])

  const workflowPromise = (run: boolean) =>
    run
      ? getWorkflowApprovalTimesheets(user).then((rows) =>
          sortWorkflowApprovals(rows, 'submitted_at', 'asc')
        )
      : Promise.resolve([] as any[])

  const approvedPromise = showApproved
    ? getApprovedTimesheetsForViewer(user, { limit: 5 })
    : Promise.resolve([] as any[])

  let recentTimesheets: any[]
  let allWorkflow: any[]
  let approvedTimesheets: any[]
  let showPending = privilegedApprover

  if (privilegedApprover) {
    ;[recentTimesheets, allWorkflow, approvedTimesheets] = await Promise.all([
      recentPromise,
      workflowPromise(true),
      approvedPromise,
    ])
  } else {
    const { data: delegationRows } = await adminSupabase
      .from('approval_delegations')
      .select('delegator_id')
      .eq('delegate_id', user.id)
      .lte('start_date', today)
      .gte('end_date', today)
    showPending = (delegationRows || []).length > 0
    ;[recentTimesheets, allWorkflow, approvedTimesheets] = await Promise.all([
      recentPromise,
      workflowPromise(showPending),
      approvedPromise,
    ])
  }

  const awaitingYourApprovalCount = allWorkflow.filter((t) => t.awaitingMyApproval).length
  const inWorkflowCount = allWorkflow.length
  const pendingApprovalsCount = awaitingYourApprovalCount
  const pendingApprovals = allWorkflow.slice(0, 5)

  const colCount = isClient
    ? 2
    : 1 + (showPending ? 1 : 0) + (showApproved ? 1 : 0)
  const gridClass =
    colCount >= 3
      ? 'grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3'
      : colCount === 2
        ? 'grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2'
        : 'grid grid-cols-1 gap-4 sm:gap-6'

  return (
    <div className={gridClass}>
      {!isClient && <RecentTimesheetsCard timesheets={recentTimesheets} />}

      {showPending && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <Link href="/dashboard/approvals" className="block mb-4 group">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Pending Approvals
              {pendingApprovalsCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-orange-600 dark:text-orange-400">
                  ({pendingApprovalsCount})
                </span>
              ) : null}
            </h2>
          </Link>
          <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 mb-3">
            <span>
              <span className="font-semibold text-orange-700 dark:text-orange-300">Awaiting your approval:</span>{' '}
              {awaitingYourApprovalCount}
            </span>
            <span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">In workflow:</span>{' '}
              {inWorkflowCount}
            </span>
          </div>
          {pendingApprovals.length > 0 ? (
            <div className="space-y-2">
              {pendingApprovals.map((ts: any) => (
                <div
                  key={ts.id}
                  className={`border rounded p-3 ${
                    ts.awaitingMyApproval
                      ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{ts.user_profiles.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Week Ending: {formatWeekEnding(ts.week_ending)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {ts.awaitingMyApproval ? 'Your turn' : 'In workflow'}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard/approvals')}`}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      {ts.awaitingMyApproval ? 'Review →' : 'View →'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No timesheets in your approval workflow.</p>
          )}
        </div>
      )}

      {showApproved && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <Link href="/dashboard/approvals/approved" className="block mb-4 group">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Approved Timesheets
            </h2>
          </Link>
          {approvedTimesheets.length > 0 ? (
            <div className="space-y-2">
              {approvedTimesheets.map((ts: any) => {
                const isPendingFinal = ts.status === 'submitted'
                return (
                  <div
                    key={ts.id}
                    className={`border rounded p-3 ${
                      isPendingFinal
                        ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {ts.user_profiles?.name || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Week Ending: {formatWeekEnding(ts.week_ending)}
                        </p>
                        {isPendingFinal && (
                          <p className="text-xs font-medium text-orange-700 dark:text-orange-300 mt-0.5">
                            {isClient
                              ? 'Approved by you · awaiting further approval'
                              : 'Approved by you · awaiting final approval'}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard/approvals/approved')}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No approved timesheets.</p>
          )}
        </div>
      )}
    </div>
  )
}

function RecentTimesheetsCard({ timesheets }: { timesheets: any[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Most Recent Timesheets
      </h2>
      {timesheets.length > 0 ? (
        <div className="space-y-2">
          {timesheets.map((ts: any) => (
            <div
              key={ts.id}
              className={`border rounded p-3 ${
                ts.status === 'rejected'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                  : ts.status === 'approved'
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                    : ts.status === 'submitted'
                      ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    {ts.status === 'approved' && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
                    {ts.status === 'rejected' && <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
                    {ts.status === 'submitted' && <Clock className="h-5 w-5 text-orange-600 flex-shrink-0" />}
                    {ts.status === 'draft' && <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />}
                    <span
                      className={`font-medium capitalize ${
                        ts.status === 'rejected'
                          ? 'text-red-800 dark:text-red-300'
                          : ts.status === 'approved'
                            ? 'text-green-800 dark:text-green-300'
                            : ts.status === 'submitted'
                              ? 'text-orange-800 dark:text-orange-300'
                              : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {ts.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                    Week Ending {formatWeekEnding(ts.week_ending)} · Created {formatDate(ts.created_at)}
                  </p>
                </div>
                <Link
                  href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard')}`}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-gray-500 dark:text-gray-400 mb-2">No timesheets yet.</p>
          <Link href="/dashboard/timesheets/new" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Create one →
          </Link>
        </div>
      )}
    </div>
  )
}

export function MainPanelsSkeleton({
  isClient,
  isSupervisorOrAbove,
}: {
  isClient: boolean
  isSupervisorOrAbove: boolean
}) {
  const cols = isClient ? 'md:grid-cols-2' : isSupervisorOrAbove ? 'md:grid-cols-3' : 'md:grid-cols-2'
  const count = isClient ? 2 : isSupervisorOrAbove ? 3 : 2
  return (
    <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 animate-pulse">
          <div className="h-6 w-44 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="h-16 bg-gray-100 dark:bg-gray-700/60 rounded" />
        </div>
      ))}
    </div>
  )
}
