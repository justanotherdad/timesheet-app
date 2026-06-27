'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PayrollWeekSummary } from '@/lib/payroll'
import { formatWeekEnding, formatHoursAmount } from '@/lib/utils'

export default function PayrollWeeksTable({ weeks }: { weeks: PayrollWeekSummary[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = weeks.length > 0 && selected.size === weeks.length
  const selectedList = useMemo(
    () => weeks.filter((w) => selected.has(w.weekEnding)).map((w) => w.weekEnding).sort(),
    [weeks, selected]
  )

  const toggle = (we: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(we)) next.delete(we)
      else next.add(we)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => (prev.size === weeks.length ? new Set() : new Set(weeks.map((w) => w.weekEnding))))
  }

  const selectedQuery = encodeURIComponent(selectedList.join(','))

  const handleExportSelected = () => {
    if (selectedList.length === 0) return
    window.location.href = `/api/admin/payroll/export?weeks=${selectedQuery}`
  }

  const handleViewSelected = () => {
    if (selectedList.length === 0) return
    router.push(`/dashboard/admin/payroll/view?weeks=${selectedQuery}`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {selected.size > 0 ? `${selected.size} week${selected.size === 1 ? '' : 's'} selected` : 'Select weeks to export or view together'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleExportSelected}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export selected
          </button>
          <button
            type="button"
            onClick={handleViewSelected}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            View selected
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all weeks"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
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
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(w.weekEnding)}
                    onChange={() => toggle(w.weekEnding)}
                    aria-label={`Select week ending ${w.weekEnding}`}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatWeekEnding(w.weekEnding)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{w.employeeCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(w.billableHours)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(w.unbillableHours)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatHoursAmount(w.totalHours)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <a
                      href={`/api/admin/payroll/export?weeks=${encodeURIComponent(w.weekEnding)}`}
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
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                  No approved timesheets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
