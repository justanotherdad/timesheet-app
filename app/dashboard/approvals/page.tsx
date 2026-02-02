import { redirect } from 'next/navigation'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function ApprovalsPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])

  const supabase = await createClient()

  // Get all users who have this user as reports_to, supervisor, manager, or final approver
  const reportsResult = await withQueryTimeout(() =>
    supabase
      .from('user_profiles')
      .select('id')
      .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
  )

  const reports = (reportsResult.data || []) as Array<{ id: string }>

  if (!reports || reports.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">No direct reports found. You don't have any timesheets to approve.</p>
          </div>
        </div>
      </div>
    )
  }

  const reportIds = reports.map(r => r.id)

  // Get all submitted weekly timesheets from direct reports
  const timesheetsResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id!inner(name, email)
      `)
      .in('user_id', reportIds)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
  )

  const timesheets = (timesheetsResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Pending Approvals" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">

          {timesheets && timesheets.length > 0 ? (
            <div className="space-y-4">
              {timesheets.map((ts: any) => (
                <div key={ts.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {ts.user_profiles.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{ts.user_profiles.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Week Ending: {formatWeekEnding(ts.week_ending)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                      <Clock className="h-4 w-4" />
                      Submitted {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString() : ''}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <form action={`/dashboard/approvals/${ts.id}/approve`} method="post" className="inline">
                      <button
                        type="submit"
                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                    </form>
                    <Link
                      href={`/dashboard/approvals/${ts.id}/reject`}
                      className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Link>
                    <Link
                      href={`/dashboard/timesheets/${ts.id}`}
                      className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300">No pending approvals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
