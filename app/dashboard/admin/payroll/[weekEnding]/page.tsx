export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import { aggregatePayrollForWeek } from '@/lib/payroll'
import { formatWeekEnding } from '@/lib/utils'
import PayrollWeekView from '@/components/admin/PayrollWeekView'

export default async function PayrollWeekPage({
  params,
}: {
  params: Promise<{ weekEnding: string }>
}) {
  const user = await requireRole(['admin', 'super_admin'])
  const { weekEnding } = await params
  const rows = await aggregatePayrollForWeek(weekEnding)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Payroll Detail" showBack backUrl="/dashboard/admin/payroll" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              Payroll — Week Ending {formatWeekEnding(weekEnding)}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              One row per employee per earning type (approved timesheets only).
            </p>
            <PayrollWeekView rows={rows} weekEnding={weekEnding} />
          </div>
        </div>
      </div>
    </div>
  )
}
