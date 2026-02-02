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

  const [sitesResult, purchaseOrdersResult, systemsResult, deliverablesResult, activitiesResult] = await Promise.all([
    withQueryTimeout(() => sitesQuery),
    withQueryTimeout(() => posQuery),
    withQueryTimeout(() => supabase.from('systems').select('*').order('name')),
    withQueryTimeout(() => supabase.from('deliverables').select('*').order('name')),
    withQueryTimeout(() => supabase.from('activities').select('*').order('name')),
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
            />
          </div>
        </div>
      </div>
    </div>
  )
}
