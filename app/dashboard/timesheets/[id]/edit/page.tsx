import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import { loadTimesheetDropdownData } from '@/lib/timesheet-bill-rate-access'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds
export const dynamic = 'force-dynamic'

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
  const timesheetResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('id', id)
      .single()
  )
  const timesheet = timesheetResult.data as any

  if (!timesheet) {
    redirect('/dashboard/timesheets')
  }

  // Verify user can edit this timesheet
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    redirect('/dashboard/timesheets')
  }

  // Allow edit when draft, or when rejected (owner can edit and resubmit), or admin
  const canEdit =
    timesheet.status === 'draft' ||
    (timesheet.status === 'rejected' && timesheet.user_id === user.id) ||
    ['admin', 'super_admin'].includes(user.profile.role)
  if (!canEdit) {
    redirect('/dashboard/timesheets')
  }

  // Existing lines first so PO dropdowns can merge bill-rate POs with historical entry POs
  const entriesResult = await withQueryTimeout<Array<any>>(() =>
    supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', id)
      .order('created_at')
  )
  const entries = Array.isArray(entriesResult.data)
    ? entriesResult.data.map((entry: any) => ({
        ...entry,
        system_name: entry.system_name || undefined,
      }))
    : []
  const entryPoIds = entries.map((e: any) => e.po_id).filter(Boolean) as string[]

  const adminSupabase = createAdminClient()
  const {
    sites,
    purchaseOrders,
    systems,
    deliverables,
    activities,
    deliverablePOIds,
    deliverableDepartmentIds,
    activityPOIds,
  } = await loadTimesheetDropdownData({
    supabase,
    admin: adminSupabase,
    userId: user.id,
    userRole: user.profile.role,
    entryPoIds,
  })

  // Get existing unbillable entries
  const unbillableResult = await withQueryTimeout<Array<any>>(() =>
    supabase
      .from('timesheet_unbillable')
      .select('*')
      .eq('timesheet_id', id)
      .order('description')
  )
  const unbillable = Array.isArray(unbillableResult.data) ? unbillableResult.data : []

  // Previous week data for "Copy Previous Week" (week before this timesheet's week_ending)
  const timesheetUserId = timesheet.user_id
  let previousWeekData: {
    entries?: Array<{
      client_project_id?: string
      po_id?: string
      task_description: string
      system_id?: string
      system_name?: string
      deliverable_id?: string
      activity_id?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
    unbillable?: Array<{
      description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
      notes?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
  } | undefined = undefined
  try {
    const currentWeekEnding = new Date(timesheet.week_ending)
    const previousWeekEnding = new Date(currentWeekEnding)
    previousWeekEnding.setDate(previousWeekEnding.getDate() - 7)
    const previousWeekEndingStr = formatDateForInput(previousWeekEnding)

    const previousTimesheetResult = await withQueryTimeout<{ id: string }>(() =>
      supabase
        .from('weekly_timesheets')
        .select('id')
        .eq('user_id', timesheetUserId)
        .eq('week_ending', previousWeekEndingStr)
        .single()
    )

    const previousTimesheet = previousTimesheetResult.data as { id: string } | null
    if (previousTimesheet?.id) {
      const previousTimesheetId = previousTimesheet.id
      const [prevEntriesResult, prevUnbillableResult] = await Promise.all([
        withQueryTimeout<Array<any>>(() =>
          supabase
            .from('timesheet_entries')
            .select('*')
            .eq('timesheet_id', previousTimesheetId)
            .order('created_at')
        ),
        withQueryTimeout<Array<any>>(() =>
          supabase
            .from('timesheet_unbillable')
            .select('*')
            .eq('timesheet_id', previousTimesheetId)
            .order('description')
        ),
      ])

      const prevEntries = Array.isArray(prevEntriesResult.data) ? prevEntriesResult.data : []
      const prevUnbillable = Array.isArray(prevUnbillableResult.data) ? prevUnbillableResult.data : []

      if (prevEntries.length > 0 || prevUnbillable.length > 0) {
        previousWeekData = {
          entries: prevEntries.map((entry: any) => ({
            client_project_id: entry.client_project_id,
            po_id: entry.po_id,
            task_description: entry.task_description,
            system_id: entry.system_id,
            system_name: entry.system_name,
            deliverable_id: entry.deliverable_id,
            activity_id: entry.activity_id,
            mon_hours: entry.mon_hours,
            tue_hours: entry.tue_hours,
            wed_hours: entry.wed_hours,
            thu_hours: entry.thu_hours,
            fri_hours: entry.fri_hours,
            sat_hours: entry.sat_hours,
            sun_hours: entry.sun_hours,
          })),
          unbillable: prevUnbillable.map((entry: any) => ({
            description: entry.description,
            notes: entry.notes ?? '',
            mon_hours: entry.mon_hours,
            tue_hours: entry.tue_hours,
            wed_hours: entry.wed_hours,
            thu_hours: entry.thu_hours,
            fri_hours: entry.fri_hours,
            sat_hours: entry.sat_hours,
            sun_hours: entry.sun_hours,
          })),
        }
      }
    }
  } catch {
    // No previous week or error — continue without copy option
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Edit Weekly Timesheet" showBack backUrl={`/dashboard/timesheets/${id}`} user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {timesheet.status === 'rejected' && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <a
              href={`/dashboard/timesheets/new?week=${formatDateForInput(new Date(timesheet.week_ending))}`}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Start fresh? Create a new timesheet for this week instead of editing →
            </a>
          </div>
        )}
        <div className="max-w-7xl mx-auto overflow-hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <WeeklyTimesheetForm
              sites={sites}
              purchaseOrders={purchaseOrders}
              systems={systems}
              deliverables={deliverables}
              activities={activities}
              deliverablePOIds={deliverablePOIds}
              deliverableDepartmentIds={deliverableDepartmentIds}
              activityPOIds={activityPOIds}
              defaultWeekEnding={formatDateForInput(new Date(timesheet.week_ending))}
              userId={user.id}
              timesheetId={timesheet.id}
              timesheetStatus={timesheet.status}
              rejectionReason={timesheet.rejection_reason ?? undefined}
              timesheetNotes={timesheet.notes ?? ''}
              initialData={{
                entries: entries || [],
                unbillable: unbillable || [],
              }}
              previousWeekData={previousWeekData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
