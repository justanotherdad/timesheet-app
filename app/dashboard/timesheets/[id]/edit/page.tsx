import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function EditTimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get the timesheet
  const { data: timesheet } = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('id', id)
      .single()
  )

  if (!timesheet) {
    redirect('/dashboard/timesheets')
  }

  // Verify user can edit this timesheet
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    redirect('/dashboard/timesheets')
  }

  if (timesheet.status !== 'draft' && !['admin', 'super_admin'].includes(user.profile.role)) {
    redirect('/dashboard/timesheets')
  }

  // Fetch all dropdown options with timeout
  const [sitesResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])

  const sites = sitesResult.data || []
  const purchaseOrders = purchaseOrdersResult.data || []

  // Get existing entries
  const { data: entries } = await withQueryTimeout(() =>
    supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', id)
      .order('created_at')
  )

  // Get existing unbillable entries
  const { data: unbillable } = await withQueryTimeout(() =>
    supabase
      .from('timesheet_unbillable')
      .select('*')
      .eq('timesheet_id', id)
      .order('description')
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Weekly Timesheet</h1>
            <WeeklyTimesheetForm
              sites={sites || []}
              purchaseOrders={purchaseOrders || []}
              defaultWeekEnding={formatDateForInput(new Date(timesheet.week_ending))}
              userId={user.id}
              timesheetId={timesheet.id}
              initialData={{
                entries: entries || [],
                unbillable: unbillable || [],
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
