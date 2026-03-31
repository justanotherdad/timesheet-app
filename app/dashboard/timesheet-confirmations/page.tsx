import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import TimesheetConfirmationsClient from '@/components/TimesheetConfirmationsClient'
import { loadCompanySettingsMap, parseConfirmationAssigneeIds } from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

export default async function TimesheetConfirmationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const settings = await loadCompanySettingsMap(admin)
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(user.id)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Confirmations" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
          Approved timesheets appear here until you confirm receipt. Other assignees have their own lists. Export or view
          the timesheet before confirming.
        </p>
        <TimesheetConfirmationsClient />
      </div>
    </div>
  )
}
