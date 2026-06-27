export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import { listPayrollWeeks } from '@/lib/payroll'
import PayrollWeeksTable from '@/components/admin/PayrollWeeksTable'

export default async function PayrollListPage() {
  const user = await requireRole(['admin', 'super_admin'])
  const weeks = await listPayrollWeeks()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Payroll" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Payroll by Week Ending</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Approved timesheets only. Most recent week first.
            </p>
            <PayrollWeeksTable weeks={weeks} />
          </div>
        </div>
      </div>
    </div>
  )
}
