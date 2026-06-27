export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import { aggregatePayrollForWeeks } from '@/lib/payroll'
import { formatWeekEnding } from '@/lib/utils'
import PayrollWeekView from '@/components/admin/PayrollWeekView'

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function PayrollMultiWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>
}) {
  const user = await requireRole(['admin', 'super_admin'])
  const { weeks: weeksParam } = await searchParams

  const weeks = [
    ...new Set(
      (weeksParam || '')
        .split(',')
        .map((w) => w.trim())
        .filter((w) => WEEK_RE.test(w))
    ),
  ].sort()

  const rows = weeks.length > 0 ? await aggregatePayrollForWeeks(weeks) : []

  const subtitle =
    weeks.length === 0
      ? 'No weeks selected.'
      : weeks.length === 1
        ? `Week Ending ${formatWeekEnding(weeks[0])}`
        : `${weeks.length} weeks: ${formatWeekEnding(weeks[0])} – ${formatWeekEnding(weeks[weeks.length - 1])}`

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Payroll Detail" showBack backUrl="/dashboard/admin/payroll" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Payroll — {subtitle}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              One row per employee per earning type per week (approved timesheets only).
            </p>
            {weeks.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 py-10 text-center">
                Select one or more week endings from the Payroll list, then click View.
              </p>
            ) : (
              <PayrollWeekView rows={rows} weekEndings={weeks} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
