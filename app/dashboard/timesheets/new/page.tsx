import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetForm from '@/components/WeeklyTimesheetForm'
import { getWeekEnding, formatDateForInput } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function NewTimesheetPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Fetch all dropdown options with timeout
  const [sitesResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])

  const sites = sitesResult.data || []
  const purchaseOrders = purchaseOrdersResult.data || []

  const weekEnding = getWeekEnding()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">New Weekly Timesheet</h1>
            <WeeklyTimesheetForm
              sites={sites || []}
              purchaseOrders={purchaseOrders || []}
              defaultWeekEnding={formatDateForInput(weekEnding)}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
