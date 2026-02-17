import { redirect } from 'next/navigation'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function ApprovalsPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])

  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  // Get all users who have this user as reports_to, supervisor, manager, or final approver
  // Use admin client so RLS does not block supervisors/managers from seeing their reports
  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
  )

  const reports = (reportsResult.data || []) as Array<{ id: string }>

  if (!reports || reports.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">No direct reports found. You don&apos;t have any timesheets to approve.</p>
          </div>
        </div>
      </div>
    )
  }

  const reportIds = reports.map(r => r.id)

  // Fetch timesheets from reports (admin client bypasses RLS)
  const timesheetsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)
      `)
      .in('user_id', reportIds)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true })
  )

  const allSubmitted = (timesheetsResult.data || []) as any[]

  // Filter to only timesheets where current user is the NEXT approver in the chain
  let timesheets = allSubmitted
  if (allSubmitted.length > 0) {
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', allSubmitted.map((t: any) => t.id))
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    const signedByTimesheet: Record<string, Set<string>> = {}
    sigs.forEach((s) => {
      if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
      signedByTimesheet[s.timesheet_id].add(s.signer_id)
    })

    timesheets = allSubmitted.filter((ts: any) => {
      const profile = ts.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string }
      const chain: string[] = []
      const firstApprover = profile?.supervisor_id || profile?.reports_to_id
      if (firstApprover) chain.push(firstApprover)
      if (profile?.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = signedByTimesheet[ts.id] || new Set<string>()
      const nextId = chain.find((uid) => !signedIds.has(uid))
      return nextId === user.id
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">

          {timesheets && timesheets.length > 0 ? (
            <div className="space-y-4">
              {timesheets.map((ts: any) => (
                <div key={ts.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {ts.user_profiles.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{ts.user_profiles.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Week Ending: {formatWeekEnding(ts.week_ending)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 shrink-0">
                      <Clock className="h-4 w-4" />
                      Submitted {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString() : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={`/dashboard/approvals/${ts.id}/approve`} method="post" className="inline">
                      <button
                        type="submit"
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        Approve
                      </button>
                    </form>
                    <Link
                      href={`/dashboard/approvals/${ts.id}/reject-form`}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0 w-full sm:w-auto bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      Reject
                    </Link>
                    <Link
                      href={`/dashboard/timesheets/${ts.id}`}
                      className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 w-full sm:w-auto bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300">No pending approvals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
