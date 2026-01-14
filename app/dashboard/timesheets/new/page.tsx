import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { getWeekEnding, formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function NewTimesheetPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  const weekEnding = getWeekEnding()
  const weekEndingStr = formatDateForInput(weekEnding)

  // Check if a timesheet already exists for this week
  const existingTimesheetResult = await withQueryTimeout<{ id: string; status: string }>(() =>
    supabase
      .from('weekly_timesheets')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('week_ending', weekEndingStr)
      .single()
  )

  // If timesheet exists, redirect to edit page
  if (existingTimesheetResult.data?.id) {
    redirect(`/dashboard/timesheets/${existingTimesheetResult.data.id}/edit`)
  }

  // Get user's assigned sites and POs (unless admin)
  let userSiteIds: string[] = []
  let userPOIds: string[] = []
  
  if (!['admin', 'super_admin'].includes(user.profile.role)) {
    const [userSitesResult, userPOsResult] = await Promise.all([
      withQueryTimeout(() => supabase.from('user_sites').select('site_id').eq('user_id', user.id)),
      withQueryTimeout(() => supabase.from('user_purchase_orders').select('purchase_order_id').eq('user_id', user.id)),
    ])
    userSiteIds = (userSitesResult.data || []).map((r: any) => r.site_id)
    userPOIds = (userPOsResult.data || []).map((r: any) => r.purchase_order_id)
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="New Weekly Timesheet" showBack backUrl="/dashboard/timesheets" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <WeeklyTimesheetForm
              sites={sites}
              purchaseOrders={purchaseOrders}
              systems={systems}
              deliverables={deliverables}
              activities={activities}
              defaultWeekEnding={weekEndingStr}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
