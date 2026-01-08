import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetExport from '@/components/WeeklyTimesheetExport'
import { formatWeekEnding } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function ExportTimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const timesheetResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles(name, email),
        timesheet_signatures(
          signer_role,
          signed_at,
          user_profiles(name)
        )
      `)
      .eq('id', id)
      .single()
  )
  const timesheet = timesheetResult.data as any

  if (!timesheet) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Timesheet not found</h1>
            <a href="/dashboard/timesheets" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            ← Back to Timesheets
          </a>
        </div>
      </div>
    )
  }

  // Verify user can view this timesheet
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    // Check if user is manager/supervisor of the timesheet owner
    const ownerResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('reports_to_id')
        .eq('id', timesheet.user_id)
        .single()
    )
    const owner = ownerResult.data as any

    if (owner?.reports_to_id !== user.id) {
      redirect('/dashboard')
    }
  }

  // Get entries
  const entriesResult = await withQueryTimeout(() =>
    supabase
      .from('timesheet_entries')
      .select(`
        *,
        sites(name, code),
        purchase_orders(po_number, description)
      `)
      .eq('timesheet_id', id)
      .order('created_at')
  )
  const entries = (entriesResult.data || []) as any[]

  // Get unbillable entries
  const unbillableResult = await withQueryTimeout(() =>
    supabase
      .from('timesheet_unbillable')
      .select('*')
      .eq('timesheet_id', id)
      .order('description')
  )
  const unbillable = (unbillableResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              Export Timesheet - Week Ending {formatWeekEnding(timesheet.week_ending)}
            </h1>
            <WeeklyTimesheetExport 
              timesheet={timesheet}
              entries={entries || []}
              unbillable={unbillable || []}
              user={timesheet.user_profiles}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
