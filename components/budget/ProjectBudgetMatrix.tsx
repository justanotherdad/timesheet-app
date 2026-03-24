'use client'

import { useEffect, useState } from 'react'
import { formatHours } from '@/lib/utils'

/** Variance always shows numeric (0.00 when balanced); formatHours treats 0 as em dash. */
function fmtVariance(n: number): string {
  return n.toFixed(2)
}

type MatrixRow = {
  id: string
  systemLabel: string
  deliverableName: string
  activityName: string
  budgetedHours: number
  actualHours: number
  variance: number
}

type MatrixPayload = {
  rows: MatrixRow[]
  totals: {
    budgetedHours: number
    actualHoursInMatrix: number
    actualHoursAllEntries: number
    unmatchedActualHours: number
  }
}

export default function ProjectBudgetMatrix({ poId, refreshTick }: { poId: string; refreshTick: number }) {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/budget/${poId}/project-matrix`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || `Could not load matrix (${res.status})`)
        }
        const json = (await res.json()) as MatrixPayload
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load project matrix')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poId, refreshTick])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
        Project matrix (system × deliverable × activity)
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Budgeted hours from bid conversion vs actual hours from approved timesheets on this PO (matched by system, deliverable, and activity).
        <span className="block mt-1">Var (h) = budget − actual (positive means under budget).</span>
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && data && data.rows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
          No project matrix rows yet. Convert a bid sheet to populate this PO, or add rows in the database.
        </p>
      )}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">System</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Deliverable</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Activity</th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Budget (h)</th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Actual (h)</th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">Var (h)</th>
                <th className="text-right py-2 pl-2 font-medium text-gray-700 dark:text-gray-300">Budget %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const pct = r.budgetedHours > 0 ? (r.actualHours / r.budgetedHours) * 100 : null
                const varCls =
                  r.budgetedHours > 0
                    ? r.variance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                    : ''
                return (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-4 text-gray-900 dark:text-gray-100 align-top">{r.systemLabel}</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">{r.deliverableName}</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">{r.activityName}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{formatHours(r.budgetedHours)}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{formatHours(r.actualHours)}</td>
                    <td className={`text-right py-2 px-2 tabular-nums ${varCls}`}>{fmtVariance(r.variance)}</td>
                    <td className="text-right py-2 pl-2 tabular-nums text-gray-600 dark:text-gray-400">
                      {pct === null ? '—' : `${pct.toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-900/40 border-t-2 border-gray-200 dark:border-gray-600">
                <td className="py-3 pr-4" colSpan={3}>
                  Totals (matrix rows)
                </td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(data.totals.budgetedHours)}</td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(data.totals.actualHoursInMatrix)}</td>
                <td className="text-right py-3 px-2 tabular-nums">
                  {fmtVariance(data.totals.budgetedHours - data.totals.actualHoursInMatrix)}
                </td>
                <td className="text-right py-3 pl-2 text-gray-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && data.totals.unmatchedActualHours > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-4">
          {formatHours(data.totals.unmatchedActualHours)} billed on this PO do not match a matrix row (missing system/deliverable/activity on
          timesheet entries, or combo not in the matrix).
        </p>
      )}

      {data && data.rows.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          All approved timesheets · total hours on PO: {formatHours(data.totals.actualHoursAllEntries)}
        </p>
      )}
    </div>
  )
}
