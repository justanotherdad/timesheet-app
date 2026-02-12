import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

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

  // Get user's assigned sites and POs (unless admin)
  let userSiteIds: string[] = []
  let userPOIds: string[] = []
  
  if (!['admin', 'super_admin'].includes(user.profile.role)) {
    const [userSitesResult, userPOsResult] = await Promise.all([
      withQueryTimeout<Array<{ site_id: string }>>(() => supabase.from('user_sites').select('site_id').eq('user_id', user.id)),
      withQueryTimeout<Array<{ purchase_order_id: string }>>(() => supabase.from('user_purchase_orders').select('purchase_order_id').eq('user_id', user.id)),
    ])
    userSiteIds = Array.isArray(userSitesResult.data) ? userSitesResult.data.map((r) => r.site_id) : []
    userPOIds = Array.isArray(userPOsResult.data) ? userPOsResult.data.map((r) => r.purchase_order_id) : []
  }

  // Fetch dropdown options - filter by user assignments unless admin
  const sitesQuery = supabase.from('sites').select('*').order('name')
  const posQuery = supabase.from('purchase_orders').select('*').order('po_number')
  
  if (!['admin', 'super_admin'].includes(user.profile.role)) {
    if (userSiteIds.length > 0) {
      sitesQuery.in('id', userSiteIds)
    } else {
      // If user has no sites assigned, return empty array
      sitesQuery.eq('id', '00000000-0000-0000-0000-000000000000') // Will return empty
    }
    if (userPOIds.length > 0) {
      posQuery.in('id', userPOIds)
    } else {
      // If user has no POs assigned, return empty array
      posQuery.eq('id', '00000000-0000-0000-0000-000000000000') // Will return empty
    }
  }

  // Systems, deliverables, activities: only those at sites assigned to the user (unless admin)
  const systemsQuery = supabase.from('systems').select('*').order('name')
  const deliverablesQuery = supabase.from('deliverables').select('*').order('name')
  const activitiesQuery = supabase.from('activities').select('*').order('name')
  if (!['admin', 'super_admin'].includes(user.profile.role)) {
    if (userSiteIds.length > 0) {
      systemsQuery.in('site_id', userSiteIds)
      deliverablesQuery.in('site_id', userSiteIds)
      activitiesQuery.in('site_id', userSiteIds)
    } else {
      systemsQuery.eq('site_id', '00000000-0000-0000-0000-000000000000')
      deliverablesQuery.eq('site_id', '00000000-0000-0000-0000-000000000000')
      activitiesQuery.eq('site_id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const [sitesResult, purchaseOrdersResult, systemsResult, deliverablesResult, activitiesResult] = await Promise.all([
    withQueryTimeout(() => sitesQuery),
    withQueryTimeout(() => posQuery),
    withQueryTimeout(() => systemsQuery),
    withQueryTimeout(() => deliverablesQuery),
    withQueryTimeout(() => activitiesQuery),
  ])

  const sites = (sitesResult.data || []) as any[]
  const purchaseOrders = (purchaseOrdersResult.data || []) as any[]
  const systems = (systemsResult.data || []) as any[]
  const deliverables = (deliverablesResult.data || []) as any[]
  const activities = (activitiesResult.data || []) as any[]

  // Get existing entries (including system_name for custom systems)
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
        system_name: entry.system_name || undefined, // Ensure system_name is included
      }))
    : []

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
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <WeeklyTimesheetForm
              sites={sites}
              purchaseOrders={purchaseOrders}
              systems={systems}
              deliverables={deliverables}
              activities={activities}
              defaultWeekEnding={formatDateForInput(new Date(timesheet.week_ending))}
              userId={user.id}
              timesheetId={timesheet.id}
              timesheetStatus={timesheet.status}
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
