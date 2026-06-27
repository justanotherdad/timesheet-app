export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import { listPayrollWeeks } from '@/lib/payroll'
import { formatWeekEnding, formatHoursAmount } from '@/lib/utils'

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

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Week Ending</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Employees</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Billable</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Non-billable</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {weeks.map((w) => (
                    <tr key={w.weekEnding} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatWeekEnding(w.weekEnding)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{w.employeeCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(w.billableHours)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(w.unbillableHours)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatHoursAmount(w.totalHours)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <a
                            href={`/api/admin/payroll/export?weekEnding=${encodeURIComponent(w.weekEnding)}`}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                          >
                            Export
                          </a>
                          <Link
                            href={`/dashboard/admin/payroll/${w.weekEnding}`}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {weeks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                        No approved timesheets yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
