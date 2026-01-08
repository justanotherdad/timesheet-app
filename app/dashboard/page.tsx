import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Calendar, FileText, Users, Settings, LogOut } from 'lucide-react'
import { formatWeekEnding, getWeekEnding, formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

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
  const { data: timesheet } = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_ending', weekEndingStr)
      .single()
  )

  // Get pending approvals if user is manager/supervisor
  let pendingApprovals = []
  if (['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    const { data: reports } = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('id')
        .eq('reports_to_id', user.id)
    )

    if (reports && reports.length > 0) {
      const reportIds = reports.map(r => r.id)
      const { data: pending } = await withQueryTimeout(() =>
        supabase
          .from('weekly_timesheets')
          .select('*, user_profiles!inner(name)')
          .in('user_id', reportIds)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: true })
          .limit(10)
      )

      pendingApprovals = pending || []
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Timesheet Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {user.profile.name} ({user.profile.role})
              </span>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

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

          {['admin', 'super_admin'].includes(user.profile.role) && (
            <Link
              href="/dashboard/admin"
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Settings className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Admin Panel</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Manage system settings</p>
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

