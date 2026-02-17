import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'
import { FileText, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import DeleteTimesheetButton from '@/components/DeleteTimesheetButton'

export const dynamic = 'force-dynamic' // Ensure fresh data on every request
export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function TimesheetsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get timesheets based on user role
  let timesheetsResult
  if (['admin', 'super_admin'].includes(user.profile.role)) {
    // Admins see all timesheets (include approval chain for "With" column)
    timesheetsResult = await withQueryTimeout(() =>
      supabase
        .from('weekly_timesheets')
        .select(`
          *,
          user_profiles!user_id(name, email, reports_to_id, manager_id, supervisor_id, final_approver_id)
        `)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  } else if (['supervisor', 'manager'].includes(user.profile.role)) {
    // Users who have this user as reports_to, supervisor, manager, or final approver (skip-none: next in chain)
    const reportsResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsResult.data || []) as Array<{ id: string }>
    const reportIds = reports.map(r => r.id)
    const allUserIds = [user.id, ...reportIds]

    // Use admin client so RLS does not block reading other users' timesheets (we already scoped to reports)
    const adminSupabase = createAdminClient()
    timesheetsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select(`
          *,
          user_profiles!user_id(name, email)
        `)
        .in('user_id', allUserIds)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  } else {
    // Regular employees see only their own timesheets
    timesheetsResult = await withQueryTimeout(() =>
      supabase
        .from('weekly_timesheets')
        .select('*')
        .eq('user_id', user.id)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  }

  const timesheets = (timesheetsResult.data || []) as any[]

  // For admin/super_admin: fetch signatures (signer_id) to show "With" in approval workflow
  // Use admin client so RLS does not block reading signatures
  let signaturesByTimesheetId: Record<string, { signer_id: string }[]> = {}
  let approverNamesById: Record<string, string> = {}
  if (['admin', 'super_admin'].includes(user.profile.role) && timesheets.length > 0) {
    const ids = timesheets.map((ts: any) => ts.id)
    const adminSupabase = createAdminClient()
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', ids)
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signaturesByTimesheetId[s.timesheet_id]) signaturesByTimesheetId[s.timesheet_id] = []
      signaturesByTimesheetId[s.timesheet_id].push({ signer_id: s.signer_id })
    })

    // Collect next-approver user IDs for submitted timesheets (need chain from user_profiles)
    const nextApproverIds = new Set<string>()
    timesheets.forEach((ts: any) => {
      if (ts.status !== 'submitted') return
      const profile = ts.user_profiles as { reports_to_id?: string; manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
      if (!profile) return
      const chain: string[] = []
      const firstApprover = profile.supervisor_id || profile.reports_to_id
      if (firstApprover) chain.push(firstApprover)
      if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = (signaturesByTimesheetId[ts.id] || []).map((s: { signer_id: string }) => s.signer_id)
      const nextId = chain.find((uid) => !signedIds.includes(uid))
      if (nextId) nextApproverIds.add(nextId)
    })
    if (nextApproverIds.size > 0) {
      const approversResult = await withQueryTimeout(() =>
        adminSupabase.from('user_profiles').select('id, name').in('id', [...nextApproverIds])
      )
      const approvers = (approversResult.data || []) as { id: string; name: string }[]
      approvers.forEach((a) => {
        approverNamesById[a.id] = a.name || 'Unknown'
      })
    }
  }

  const getNextApproverId = (ts: any): string | undefined => {
    if (ts.status !== 'submitted') return undefined
    const profile = ts.user_profiles as { reports_to_id?: string; manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
    if (!profile) return undefined
    const chain: string[] = []
    const firstApprover = profile.supervisor_id || profile.reports_to_id
    if (firstApprover) chain.push(firstApprover)
    if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
    if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
    const signedIds = (signaturesByTimesheetId[ts.id] || []).map((s: { signer_id: string }) => s.signer_id)
    return chain.find((uid) => !signedIds.includes(uid))
  }

  const getWithLabel = (ts: any) => {
    if (ts.status === 'draft') return '—'
    if (ts.status === 'rejected') return 'Rejected'
    if (ts.status === 'approved') return 'Approved'
    if (ts.status === 'submitted') {
      const nextId = getNextApproverId(ts)
      if (nextId === undefined) return 'Approved'
      const profile = ts.user_profiles as { manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
      if (nextId === profile?.manager_id) return 'With Manager'
      if (nextId === profile?.supervisor_id) return 'With Supervisor'
      if (nextId === profile?.final_approver_id) return 'With Final Approver'
      return '—'
    }
    return '—'
  }

  const getWithPersonName = (ts: any) => {
    if (ts.status === 'draft') return '—'
    if (ts.status === 'rejected') return 'Rejected'
    if (ts.status === 'approved') return 'Approved'
    if (ts.status === 'submitted') {
      const nextId = getNextApproverId(ts)
      if (nextId === undefined) return 'Approved'
      if (approverNamesById[nextId]) return approverNamesById[nextId]
      return getWithLabel(ts)
    }
    return '—'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'submitted':
        return <Clock className="h-5 w-5 text-orange-600" />
      default:
        return <FileText className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
      case 'rejected':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
      case 'submitted':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="My Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="w-full max-w-[1920px] mx-auto">
          <div className="flex justify-end mb-6">
            <a
              href="/dashboard/timesheets/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-block"
            >
              New Timesheet
            </a>
          </div>

          {timesheets && timesheets.length > 0 ? (
            <>
              {/* Mobile: cards with Employee, Week Ending, Status, View button only */}
              <div className="md:hidden space-y-3">
                {timesheets.map((ts) => (
                  <div
                    key={ts.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {ts.user_profiles?.name || 'Unknown'}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Week ending {formatWeekEnding(ts.week_ending)}
                        </p>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                          {getStatusIcon(ts.status)}
                          {ts.status}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/timesheets/${ts.id}`}
                        className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: full table, no horizontal scroll */}
              <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="overflow-visible">
                  <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                          <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%] min-w-0">
                            Employee
                          </th>
                        )}
                        <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%] min-w-0">
                          Week Ending
                        </th>
                        <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%] min-w-0">
                          Week Starting
                        </th>
                        <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%] min-w-0">
                          Status
                        </th>
                        {(['admin', 'super_admin'].includes(user.profile.role)) && (
                          <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%] min-w-0">
                            With
                          </th>
                        )}
                        {(['admin', 'super_admin'].includes(user.profile.role)) && (
                          <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%] min-w-0">
                            With (person)
                          </th>
                        )}
                        <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[8%] min-w-0">
                          Created
                        </th>
                        <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[20%] min-w-0">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {timesheets.map((ts) => (
                        <tr key={ts.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                            <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate" title={ts.user_profiles?.name || 'Unknown'}>
                              {ts.user_profiles?.name || 'Unknown'}
                            </td>
                          )}
                          <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                            {formatWeekEnding(ts.week_ending)}
                          </td>
                          <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                            {formatWeekEnding(ts.week_starting)}
                          </td>
                          <td className="px-3 lg:px-6 py-3 min-w-0">
                            <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                              {getStatusIcon(ts.status)}
                              {ts.status}
                            </span>
                          </td>
                          {(['admin', 'super_admin'].includes(user.profile.role)) && (
                            <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate">
                              {getWithLabel(ts)}
                            </td>
                          )}
                          {(['admin', 'super_admin'].includes(user.profile.role)) && (
                            <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate" title={getWithPersonName(ts)}>
                              {getWithPersonName(ts)}
                            </td>
                          )}
                          <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                            {formatWeekEnding(ts.created_at)}
                          </td>
                          <td className="px-3 lg:px-6 py-3 text-sm font-medium min-w-0">
                            <div className="flex flex-wrap gap-2">
                              {ts.status === 'draft' && (
                                <Link
                                  href={`/dashboard/timesheets/${ts.id}/edit`}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                >
                                  Edit
                                </Link>
                              )}
                              {ts.status === 'draft' && (
                                <form action={`/dashboard/timesheets/${ts.id}/submit`} method="post" className="inline">
                                  <button
                                    type="submit"
                                    className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                                  >
                                    Submit
                                  </button>
                                </form>
                              )}
                              {ts.status === 'submitted' && ts.user_id === user.id && (
                                <form action={`/dashboard/timesheets/${ts.id}/recall`} method="post" className="inline">
                                  <button
                                    type="submit"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                  >
                                    Edit
                                  </button>
                                </form>
                              )}
                              {ts.status === 'rejected' && ts.user_id === user.id && (
                                <Link
                                  href={`/dashboard/timesheets/${ts.id}/edit`}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                >
                                  Edit
                                </Link>
                              )}
                              {ts.status === 'approved' && ['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
                                <Link
                                  href={`/dashboard/approvals/${ts.id}/reject-form`}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                >
                                  Reject
                                </Link>
                              )}
                              <Link
                                href={`/dashboard/timesheets/${ts.id}/export`}
                                className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300"
                              >
                                Export
                              </Link>
                              <Link
                                href={`/dashboard/timesheets/${ts.id}`}
                                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                              >
                                View
                              </Link>
                              <DeleteTimesheetButton timesheetId={ts.id} status={ts.status} userRole={user.profile.role} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300 mb-4">No timesheets found.</p>
              <a
                href="/dashboard/timesheets/new"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Create your first timesheet →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
