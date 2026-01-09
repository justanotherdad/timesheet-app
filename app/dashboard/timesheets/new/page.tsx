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
  const existingTimesheetResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('week_ending', weekEndingStr)
      .single()
  )

  // If timesheet exists, redirect to edit page
  if (existingTimesheetResult.data) {
    redirect(`/dashboard/timesheets/${existingTimesheetResult.data.id}/edit`)
  }

  // Fetch all dropdown options with timeout
  const [sitesResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])

  const sites = (sitesResult.data || []) as any[]
  const purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="New Weekly Timesheet" showBack backUrl="/dashboard/timesheets" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <WeeklyTimesheetForm
              sites={sites}
              purchaseOrders={purchaseOrders}
              defaultWeekEnding={weekEndingStr}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
