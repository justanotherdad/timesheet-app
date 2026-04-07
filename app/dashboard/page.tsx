import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import { hasActiveOutgoingDelegation } from '@/lib/approval-delegation'
import Link from 'next/link'
import { Calendar, FileText, Users, Building, Activity, CheckCircle, XCircle, Clock, BarChart3, ClipboardList, FileBarChart, ClipboardCheck } from 'lucide-react'
import { formatWeekEnding, formatDate, getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import { loadCompanySettingsMap, parseConfirmationAssigneeIds } from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get user's 5 most recent timesheets (all statuses including draft), newest first
  const recentTimesheetsResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
  )

  let recentTimesheets = (recentTimesheetsResult.data || []) as any[]

  // Auto-approve any submitted timesheet if user is final approver with no one above
  for (let i = 0; i < recentTimesheets.length; i++) {
    const ts = recentTimesheets[i]
    if (ts?.status === 'submitted') {
      const didApprove = await checkAndAutoApproveIfFinal(ts.id)
      if (didApprove) {
        const { data: refetched } = await supabase
          .from('weekly_timesheets')
          .select('*')
          .eq('id', ts.id)
          .single()
        recentTimesheets[i] = refetched || ts
      }
    }
  }

  // Pending approvals: same scope as /dashboard/approvals (direct reports + expansion when user is an active delegate)
  let pendingApprovals: any[] = []
  let pendingApprovalsCount = 0
  let hasActiveDelegationAsDelegate = false
  const adminSupabase = createAdminClient()
  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
  )
  let reports = (reportsResult.data || []) as Array<{ id: string }>

  const today = getCalendarDateStringInAppTimezone()
  const { data: delegationRows } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', user.id)
    .lte('start_date', today)
    .gte('end_date', today)
  const delegatorIds = [...new Set((delegationRows || []).map((r: { delegator_id: string }) => r.delegator_id))]
  hasActiveDelegationAsDelegate = delegatorIds.length > 0
  const delegatedByIds = new Set(delegatorIds)
  const hasOutgoingDelegation = await hasActiveOutgoingDelegation(adminSupabase, user.id, today)
  if (delegatorIds.length > 0) {
    const seen = new Set(reports.map((r) => r.id))
    for (const delegatorId of delegatorIds) {
      const delegatorReportsResult = await withQueryTimeout(() =>
        adminSupabase
          .from('user_profiles')
          .select('id')
          .or(`reports_to_id.eq.${delegatorId},supervisor_id.eq.${delegatorId},manager_id.eq.${delegatorId},final_approver_id.eq.${delegatorId}`)
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

  if (reports.length > 0) {
    const reportIds = reports.map((r) => r.id)
    const pendingResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select('*, user_profiles!user_id!inner(name, reports_to_id, supervisor_id, manager_id, final_approver_id)')
        .in('user_id', reportIds)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true })
    )

    const allPending = (pendingResult.data || []) as any[]

    const signaturesResult = allPending.length > 0
      ? await withQueryTimeout(() =>
          adminSupabase
            .from('timesheet_signatures')
            .select('timesheet_id, signer_id')
            .in('timesheet_id', allPending.map((t: any) => t.id))
        )
      : { data: [] }
    const sigs = (signaturesResult.data || []) as { timesheet_id: string; signer_id: string }[]
    const signedByTimesheet: Record<string, Set<string>> = {}
    sigs.forEach((s) => {
      if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
      signedByTimesheet[s.timesheet_id].add(s.signer_id)
    })

    const allPendingForUser = allPending.filter((ts: any) => {
      const profile = ts.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string }
      const chain: string[] = []
      const firstApprover = profile?.supervisor_id || profile?.reports_to_id
      if (firstApprover) chain.push(firstApprover)
      if (profile?.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = signedByTimesheet[ts.id] || new Set<string>()
      const nextId = chain.find((uid) => !signedIds.has(uid))
      if (nextId === user.id && hasOutgoingDelegation) {
        return false
      }
      return nextId === user.id || (nextId != null && delegatedByIds.has(nextId))
    })
    pendingApprovals = allPendingForUser.slice(0, 5)
    pendingApprovalsCount = allPendingForUser.length
  }

  let showTimesheetConfirmationsCard = false
  let timesheetConfirmationsPending = 0
  const settingsForConfirm = await loadCompanySettingsMap(adminSupabase)
  const confirmationAssignees = parseConfirmationAssigneeIds(settingsForConfirm)
  if (confirmationAssignees.length > 0 && confirmationAssignees.includes(user.id)) {
    showTimesheetConfirmationsCard = true
    const { data: confReceipts } = await adminSupabase
      .from('timesheet_confirmation_receipts')
      .select('timesheet_id, approval_sequence')
      .eq('user_id', user.id)
    const receiptKey = new Set((confReceipts || []).map((r) => `${r.timesheet_id}:${r.approval_sequence}`))
    const { data: approvedForConfirm } = await adminSupabase
      .from('weekly_timesheets')
      .select('id, approval_confirmation_sequence')
      .eq('status', 'approved')
    for (const row of approvedForConfirm || []) {
      const r = row as { id: string; approval_confirmation_sequence?: number }
      const seq = r.approval_confirmation_sequence ?? 0
      if (seq <= 0) continue
      if (!receiptKey.has(`${r.id}:${seq}`)) timesheetConfirmationsPending += 1
    }
  }

  // Get approved timesheets from reports (for supervisors, managers, admins)
  let approvedTimesheets: any[] = []
  if (['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    const adminSupabase = createAdminClient()
    const reportsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsResult.data || []) as Array<{ id: string }>
    if (reports && reports.length > 0) {
      const reportIds = reports.map(r => r.id)
      const approvedResult = await withQueryTimeout(() =>
        adminSupabase
          .from('weekly_timesheets')
          .select('*, user_profiles!user_id(name)')
          .in('user_id', reportIds)
          .eq('status', 'approved')
          .order('approved_at', { ascending: false })
      )
      approvedTimesheets = (Array.isArray(approvedResult.data) ? approvedResult.data : []).slice(0, 5)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Dashboard" user={user} />

      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Link
            href="/dashboard/timesheets/new"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">New Timesheet</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">Enter hours for this week</p>
              </div>
            </div>
          </Link>

          <Link
            href="/dashboard/timesheets"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">My Timesheets</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">View history and status</p>
              </div>
            </div>
          </Link>

          {showTimesheetConfirmationsCard && (
            <Link
              href="/dashboard/timesheet-confirmations"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-lg relative">
                  <ClipboardCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  {timesheetConfirmationsPending > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold">
                      {timesheetConfirmationsPending > 99 ? '99+' : timesheetConfirmationsPending}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Timesheet Confirmations</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {timesheetConfirmationsPending > 0
                      ? `${timesheetConfirmationsPending} awaiting confirmation`
                      : 'Confirm receipt of approved timesheets'}
                  </p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/admin/users"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Users</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">View or manage profiles, roles, and approval chain (timesheet POs: set on each PO budget)</p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/reports"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-orange-100 p-3 rounded-lg">
                  <FileBarChart className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Reports</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Run reports for invoices, PO status, and more
                  </p>
                </div>
              </div>
            </Link>
          )}

          {['manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/budget"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Budget Detail</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">View PO budgets, invoices, and billable hours</p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/bid-sheets"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="bg-violet-100 dark:bg-violet-900/30 p-3 rounded-lg">
                  <ClipboardList className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Bid Sheets</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Create and manage bid sheets, convert to project budgets</p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <>
              <Link
                href="/dashboard/admin/organization"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                    <Building className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Organization</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Sites, departments, purchase orders, expense types, company information</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/dashboard/admin/timesheet-options"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
                    <Activity className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Timesheet Options</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Systems, activities, deliverables, delegation</p>
                  </div>
                </div>
              </Link>
              {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
              <>
              <Link
                href="/dashboard/admin/data-view"
                className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow min-h-[72px] sm:min-h-0"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg">
                    <FileText className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">View Timesheet Data</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">View and filter all timesheet entries</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/dashboard/admin/export"
                className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow min-h-[72px] sm:min-h-0"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="bg-cyan-100 dark:bg-cyan-900/30 p-3 rounded-lg">
                    <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Export Timesheets</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Export timesheets for any week</p>
                  </div>
                </div>
              </Link>
              </>
              )}
            </>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Most Recent Timesheets
            </h2>
            {recentTimesheets.length > 0 ? (
              <div className="space-y-2">
                {recentTimesheets.map((ts: any) => (
                  <div
                    key={ts.id}
                    className={`border rounded p-3 ${
                      ts.status === 'rejected' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' :
                      ts.status === 'approved' ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' :
                      ts.status === 'submitted' ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20' :
                      'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          {ts.status === 'approved' && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
                          {ts.status === 'rejected' && <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
                          {ts.status === 'submitted' && <Clock className="h-5 w-5 text-orange-600 flex-shrink-0" />}
                          {ts.status === 'draft' && <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />}
                          <span className={`font-medium capitalize ${
                            ts.status === 'rejected' ? 'text-red-800 dark:text-red-300' :
                            ts.status === 'approved' ? 'text-green-800 dark:text-green-300' :
                            ts.status === 'submitted' ? 'text-orange-800 dark:text-orange-300' :
                            'text-gray-900 dark:text-gray-100'
                          }`}>
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
                <Link
                  href="/dashboard/timesheets/new"
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Create one →
                </Link>
              </div>
            )}
          </div>

          {(['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) || hasActiveDelegationAsDelegate) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
              <Link
                href="/dashboard/approvals"
                className="block mb-4 group"
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Pending Approvals
                </h2>
              </Link>
              {pendingApprovals.length > 0 ? (
                <div className="space-y-2">
                  {pendingApprovals.map((ts: any) => (
                    <div key={ts.id} className="border border-orange-200 dark:border-orange-800 rounded p-3 bg-orange-50 dark:bg-orange-900/20">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{ts.user_profiles.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Week Ending: {formatWeekEnding(ts.week_ending)}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard/approvals')}`}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          Review →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No pending approvals.</p>
              )}
            </div>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
              <Link
                href="/dashboard/approvals/approved"
                className="block mb-4 group"
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Approved Timesheets
                </h2>
              </Link>
              {approvedTimesheets.length > 0 ? (
                <div className="space-y-2">
                  {approvedTimesheets.map((ts: any) => (
                    <div key={ts.id} className="border border-green-200 dark:border-green-800 rounded p-3 bg-green-50 dark:bg-green-900/20">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{ts.user_profiles?.name || 'Unknown'}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Week Ending: {formatWeekEnding(ts.week_ending)}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard/approvals/approved')}`}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No approved timesheets.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

