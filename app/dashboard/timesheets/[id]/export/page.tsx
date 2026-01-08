import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetExport from '@/components/WeeklyTimesheetExport'
import { formatWeekEnding } from '@/lib/utils'

export default async function ExportTimesheetPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: timesheet } = await supabase
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
    .eq('id', params.id)
    .single()

  if (!timesheet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Timesheet not found</h1>
          <a href="/dashboard/timesheets" className="text-blue-600 hover:text-blue-700">
            ← Back to Timesheets
          </a>
        </div>
      </div>
    )
  }

  // Verify user can view this timesheet
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    // Check if user is manager/supervisor of the timesheet owner
    const { data: owner } = await supabase
      .from('user_profiles')
      .select('reports_to_id')
      .eq('id', timesheet.user_id)
      .single()

    if (owner?.reports_to_id !== user.id) {
      redirect('/dashboard')
    }
  }

  // Get entries
  const { data: entries } = await supabase
    .from('timesheet_entries')
    .select(`
      *,
      sites(name, code),
      purchase_orders(po_number, description)
    `)
    .eq('timesheet_id', params.id)
    .order('created_at')

  // Get unbillable entries
  const { data: unbillable } = await supabase
    .from('timesheet_unbillable')
    .select('*')
    .eq('timesheet_id', params.id)
    .order('description')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
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
