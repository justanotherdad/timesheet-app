import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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
          user_profiles!user_id(name, email, manager_id, supervisor_id, final_approver_id)
        `)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  } else if (['supervisor', 'manager'].includes(user.profile.role)) {
    // Supervisors and managers see timesheets of users who have them as reports_to, supervisor, or manager
    const reportsResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsResult.data || []) as Array<{ id: string }>
    const reportIds = reports.map(r => r.id)
    
    // Include own timesheets plus reports' timesheets
    const allUserIds = [user.id, ...reportIds]
    
    timesheetsResult = await withQueryTimeout(() =>
      supabase
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
  let signaturesByTimesheetId: Record<string, { signer_id: string }[]> = {}
  if (['admin', 'super_admin'].includes(user.profile.role) && timesheets.length > 0) {
    const ids = timesheets.map((ts: any) => ts.id)
    const sigResult = await withQueryTimeout(() =>
      supabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', ids)
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signaturesByTimesheetId[s.timesheet_id]) signaturesByTimesheetId[s.timesheet_id] = []
      signaturesByTimesheetId[s.timesheet_id].push({ signer_id: s.signer_id })
    })
  }

  const getWithLabel = (ts: any) => {
    if (ts.status === 'draft') return '—'
    if (ts.status === 'rejected') return 'Rejected'
    if (ts.status === 'approved') return 'Approved'
    if (ts.status === 'submitted') {
      const profile = ts.user_profiles as { manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
      const chain: string[] = []
      if (profile?.manager_id) chain.push(profile.manager_id)
      if (profile?.supervisor_id && !chain.includes(profile.supervisor_id)) chain.push(profile.supervisor_id)
      if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = (signaturesByTimesheetId[ts.id] || []).map((s) => s.signer_id)
      const nextId = chain.find((uid) => !signedIds.includes(uid))
      if (nextId === undefined) return 'Approved'
      if (nextId === profile?.manager_id) return 'With Manager'
      if (nextId === profile?.supervisor_id) return 'With Supervisor'
      if (nextId === profile?.final_approver_id) return 'With Final Approver'
      return '—'
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
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-end mb-6">
            <a
              href="/dashboard/timesheets/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-block"
            >
              New Timesheet
            </a>
          </div>

          {timesheets && timesheets.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Employee
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Week Ending
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Week Starting
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      {(['admin', 'super_admin'].includes(user.profile.role)) && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          With
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {timesheets.map((ts) => (
                      <tr key={ts.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {ts.user_profiles?.name || 'Unknown'}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatWeekEnding(ts.week_ending)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatWeekEnding(ts.week_starting)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                            {getStatusIcon(ts.status)}
                            {ts.status}
                          </span>
                        </td>
                        {(['admin', 'super_admin'].includes(user.profile.role)) && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {getWithLabel(ts)}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatWeekEnding(ts.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
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
