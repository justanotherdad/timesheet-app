import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import { formatWeekEnding } from '@/lib/utils'
import Link from 'next/link'

export const maxDuration = 10

export default async function RejectTimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const { id } = await params
  const adminSupabase = createAdminClient()

  // Use admin client so RLS does not block supervisors/managers from loading the reject form
  const { data: timesheet, error } = await withQueryTimeout(() =>
    adminSupabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id(name, email)
      `)
      .eq('id', id)
      .single()
  )

  if (error || !timesheet) {
    redirect('/dashboard/approvals')
  }

  type Row = { user_profiles?: { name?: string; email?: string }; user_id?: string; week_ending?: string; status?: string }
  const ts = timesheet as Row
  const profile = ts.user_profiles as { name?: string; email?: string }
  const canReject =
    ts.user_id === user.id ||
    ['admin', 'super_admin'].includes(user.profile.role)

  if (!canReject) {
    const ownerResult = await withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('reports_to_id, supervisor_id, manager_id, final_approver_id')
        .eq('id', ts.user_id)
        .single()
    )
    const owner = ownerResult.data as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string } | null
    const isApprover =
      owner?.reports_to_id === user.id ||
      owner?.supervisor_id === user.id ||
      owner?.manager_id === user.id ||
      owner?.final_approver_id === user.id
    if (!isApprover) {
      redirect('/dashboard/approvals')
    }
  }

  if (!['submitted', 'approved'].includes(ts.status || '')) {
    redirect('/dashboard/approvals')
  }

  const isApprovedTimesheet = ts.status === 'approved'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Reject Timesheet" showBack backUrl="/dashboard/approvals" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {isApprovedTimesheet ? 'Reject approved timesheet' : 'Reject timesheet'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {profile?.name} – Week Ending {formatWeekEnding(ts.week_ending ?? '')}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {isApprovedTimesheet
              ? 'This will revert the timesheet to editable status. The employee will see your note and must edit and resubmit, then it will go through the full approval workflow again (Supervisor → Manager → Final Approver).'
              : 'Add a note for the employee describing the necessary change. They will see this when they open the timesheet.'}
          </p>
          <form action={`/dashboard/approvals/${id}/reject`} method="post" className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Note for employee (required change)
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={4}
                required
                placeholder="e.g. Please correct Monday hours for Project X to 8.0"
                className="w-full px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 min-h-[120px]"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Link
                href="/dashboard/approvals"
                className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="min-h-[44px] sm:min-h-0 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Reject Timesheet
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
