import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Calendar, FileText, Users, Settings, Building, Activity, Package } from 'lucide-react'
import { formatWeekEnding, getWeekEnding, formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const weekEnding = getWeekEnding()
  const weekEndingStr = formatDateForInput(weekEnding)

  // Get user's weekly timesheet for current week with timeout
  const timesheetResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_ending', weekEndingStr)
      .single()
  )

  const timesheet = timesheetResult.data as any

  // Get pending approvals: include employees who have this user as reports_to, supervisor, or manager
  let pendingApprovals: any[] = []
  if (['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    const reportsResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )

    const reports = (reportsResult.data || []) as Array<{ id: string }>

    if (reports && reports.length > 0) {
      const reportIds = reports.map(r => r.id)
      const pendingResult = await withQueryTimeout(() =>
        supabase
          .from('weekly_timesheets')
          .select('*, user_profiles!user_id!inner(name)')
          .in('user_id', reportIds)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: true })
          .limit(10)
      )

      pendingApprovals = (pendingResult.data || []) as any[]
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Dashboard" user={user} />

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link
            href="/dashboard/timesheets/new"
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
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
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">My Timesheets</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">View history and status</p>
              </div>
            </div>
          </Link>

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/admin/users"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Users</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Add, edit, and manage user accounts</p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/approvals"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-orange-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pending Approvals</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {pendingApprovals.length} timesheet{pendingApprovals.length !== 1 ? 's' : ''} pending
                  </p>
                </div>
              </div>
            </Link>
          )}

          {['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
            <>
              <Link
                href="/dashboard/admin/organization"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                    <Building className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Organization</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Sites, departments, purchase orders</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/dashboard/admin/systems"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg">
                    <Activity className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Systems</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Add and edit system options</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/dashboard/admin/activities"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-pink-100 dark:bg-pink-900/30 p-3 rounded-lg">
                    <Activity className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Activities</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Add and edit activity options</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/dashboard/admin/deliverables"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-lg">
                    <Package className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Manage Deliverables</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Add and edit deliverable options</p>
                  </div>
                </div>
              </Link>
              {['manager', 'admin', 'super_admin'].includes(user.profile.role) && (
              <>
              <Link
                href="/dashboard/admin/data-view"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
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
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Current Week ({formatWeekEnding(weekEnding)})
            </h2>
            {timesheet ? (
              <div className="border border-gray-200 rounded p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{timesheet.status}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Created {new Date(timesheet.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/timesheets/${timesheet.id}`}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-500 dark:text-gray-400 mb-2">No timesheet for this week yet.</p>
                <Link
                  href="/dashboard/timesheets/new"
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Create one →
                </Link>
              </div>
            )}
          </div>

          {pendingApprovals.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Pending Approvals
              </h2>
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
                        href={`/dashboard/timesheets/${ts.id}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Review →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

