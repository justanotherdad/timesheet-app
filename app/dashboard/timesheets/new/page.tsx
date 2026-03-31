import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { getWeekEnding, formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import { loadTimesheetDropdownData } from '@/lib/timesheet-bill-rate-access'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds
export const dynamic = 'force-dynamic'

type SearchParams = { week?: string }

export default async function NewTimesheetPage(props: { searchParams?: Promise<SearchParams> }) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()
  const params = props.searchParams ? await props.searchParams : {}
  const weekParam = params.week

  const weekEnding = getWeekEnding()
  const weekEndingStr = formatDateForInput(weekEnding)

  // If ?week=YYYY-MM-DD is provided (e.g. from "Create new timesheet" on rejected edit page), use it
  const useWeekFromParam = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)

  // Check for timesheets this week (may have multiple - use most recent for redirect logic)
  const existingTimesheetResult = await withQueryTimeout<{ id: string; status: string }[]>(() =>
    supabase
      .from('weekly_timesheets')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('week_ending', weekEndingStr)
      .order('created_at', { ascending: false })
      .limit(1)
  )

  const existing = Array.isArray(existingTimesheetResult.data) && existingTimesheetResult.data.length > 0
    ? existingTimesheetResult.data[0]
    : null
  // Effective week for the form: previous week by default (no existing); if current week exists and is submitted, use next week
  // When ?week= is provided (e.g. "Create new" from rejected edit), use that week
  let effectiveWeekEnding = new Date(weekEnding)
  let effectiveWeekEndingStr = weekEndingStr

  if (useWeekFromParam) {
    effectiveWeekEndingStr = weekParam!
    effectiveWeekEnding = new Date(weekParam!)
  } else if (!existing?.id) {
    // No timesheet for current week — default to previous week
    const prevWeekEnding = new Date(weekEnding)
    prevWeekEnding.setDate(prevWeekEnding.getDate() - 7)
    effectiveWeekEnding = prevWeekEnding
    effectiveWeekEndingStr = formatDateForInput(prevWeekEnding)
  } else if (existing?.id) {
    // Allow multiple timesheets per week
    if (existing.status === 'draft') {
      // Has draft(s) — show form for current week so user can create another
      effectiveWeekEnding = weekEnding
      effectiveWeekEndingStr = weekEndingStr
    } else {
      // Current week submitted/approved/rejected — default to next week
      const nextWeekEnding = new Date(weekEnding)
      nextWeekEnding.setDate(nextWeekEnding.getDate() + 7)
      const nextWeekEndingStr = formatDateForInput(nextWeekEnding)

      const nextExistingResult = await withQueryTimeout<{ id: string; status: string }[]>(() =>
        supabase
          .from('weekly_timesheets')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('week_ending', nextWeekEndingStr)
          .order('created_at', { ascending: false })
          .limit(1)
      )
      const nextExisting = Array.isArray(nextExistingResult.data) && nextExistingResult.data.length > 0
        ? nextExistingResult.data[0]
        : null
      if (nextExisting?.id && nextExisting.status !== 'draft') {
        redirect(`/dashboard/timesheets/${nextExisting.id}`)
      }
      effectiveWeekEnding = nextWeekEnding
      effectiveWeekEndingStr = nextWeekEndingStr
    }
  }

  // POs/sites/systems from Bill Rates by Person (non-admins); admins see full active catalog
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
    entryPoIds: [],
  })

  // Previous week for "Copy Previous Week" is the week before the effective (current or next) week we're creating
  const previousWeekEnding = new Date(effectiveWeekEnding)
  previousWeekEnding.setDate(previousWeekEnding.getDate() - 7)
  const previousWeekEndingStr = formatDateForInput(previousWeekEnding)

  // Check if previous week timesheet exists
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
    const previousTimesheetResult = await withQueryTimeout<{ id: string }>(() =>
      supabase
        .from('weekly_timesheets')
        .select('id')
        .eq('user_id', user.id)
        .eq('week_ending', previousWeekEndingStr)
        .single()
    )

    const previousTimesheet = previousTimesheetResult.data as { id: string } | null
    if (previousTimesheet?.id) {
      const previousTimesheetId = previousTimesheet.id
      // Fetch previous week's entries and unbillable
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
        )
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
          }))
        }
      }
    }
  } catch (error) {
    // If previous week doesn't exist or error, just continue without it
    console.log('No previous week data available or error fetching:', error)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="New Weekly Timesheet" showBack backUrl="/dashboard/timesheets" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
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
              defaultWeekEnding={effectiveWeekEndingStr}
              userId={user.id}
              previousWeekData={previousWeekData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
