'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Printer, Search } from 'lucide-react'
import { formatHours } from '@/lib/utils'

/** Variance always shows numeric (0.00 when balanced); formatHours treats 0 as em dash. */
function fmtVariance(n: number): string {
  return n.toFixed(2)
}

function safeFileBase(name: string): string {
  const s = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return s.slice(0, 80) || 'project-matrix'
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

type SortColumn = 'system' | 'deliverable' | 'activity' | 'budget' | 'actual' | 'variance' | 'pct'

type ProjectBudgetMatrixProps = {
  poId: string
  refreshTick: number
  /** Shown under the title and in print; optional filename hint. */
  reportTitle?: string
  /** Used for download filenames (e.g. PO number). */
  fileBaseName?: string
}

export default function ProjectBudgetMatrix({
  poId,
  refreshTick,
  reportTitle,
  fileBaseName,
}: ProjectBudgetMatrixProps) {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('system')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

  const filteredRows = useMemo(() => {
    if (!data?.rows.length) return []
    const q = filterText.trim().toLowerCase()
    if (!q) return data.rows
    return data.rows.filter((r) => {
      const blob = [
        r.systemLabel,
        r.deliverableName,
        r.activityName,
        String(r.budgetedHours),
        String(r.actualHours),
        String(r.variance),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [data, filterText])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    const mult = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'system':
          cmp = a.systemLabel.localeCompare(b.systemLabel, undefined, { sensitivity: 'base' })
          break
        case 'deliverable':
          cmp = a.deliverableName.localeCompare(b.deliverableName, undefined, { sensitivity: 'base' })
          break
        case 'activity':
          cmp = a.activityName.localeCompare(b.activityName, undefined, { sensitivity: 'base' })
          break
        case 'budget':
          cmp = a.budgetedHours - b.budgetedHours
          break
        case 'actual':
          cmp = a.actualHours - b.actualHours
          break
        case 'variance':
          cmp = a.variance - b.variance
          break
        case 'pct': {
          const va = a.budgetedHours > 0 ? a.actualHours / a.budgetedHours : null
          const vb = b.budgetedHours > 0 ? b.actualHours / b.budgetedHours : null
          if (va == null && vb == null) cmp = 0
          else if (va == null) cmp = 1
          else if (vb == null) cmp = -1
          else cmp = va - vb
          break
        }
        default:
          cmp = 0
      }
      return mult * cmp
    })
    return rows
  }, [filteredRows, sortColumn, sortDir])

  const visibleTotals = useMemo(() => {
    const budgetedHours = sortedRows.reduce((s, r) => s + r.budgetedHours, 0)
    const actualHoursInMatrix = sortedRows.reduce((s, r) => s + r.actualHours, 0)
    return {
      budgetedHours,
      actualHoursInMatrix,
      variance: budgetedHours - actualHoursInMatrix,
      pct: budgetedHours > 0 ? (actualHoursInMatrix / budgetedHours) * 100 : null,
    }
  }, [sortedRows])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir(col === 'budget' || col === 'actual' || col === 'variance' || col === 'pct' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const exportCsv = () => {
    if (!data || sortedRows.length === 0) return
    const q = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`
    const headers = [
      'System',
      'Deliverable',
      'Activity',
      'Budget (h)',
      'Actual (h)',
      'Var (h)',
      'Budget %',
    ]
    const lines: string[] = []
    if (reportTitle) {
      lines.push([q('Report'), q(reportTitle)].join(','))
    }
    lines.push([q('Generated'), q(new Date().toISOString())].join(','))
    if (filterText.trim()) {
      lines.push([q('Filter'), q(filterText.trim())].join(','))
    }
    lines.push([q('Sort'), q(`${sortColumn} ${sortDir}`)].join(','))
    lines.push(headers.join(','))
    for (const r of sortedRows) {
      const pct = r.budgetedHours > 0 ? (r.actualHours / r.budgetedHours) * 100 : ''
      lines.push(
        [
          q(r.systemLabel),
          q(r.deliverableName),
          q(r.activityName),
          q(r.budgetedHours.toFixed(2)),
          q(r.actualHours.toFixed(2)),
          q(r.variance.toFixed(2)),
          pct === '' ? q('') : q(Number(pct.toFixed(2))),
        ].join(',')
      )
    }
    lines.push(
      [
        q(filterText.trim() ? 'Totals (visible rows)' : 'Totals (matrix rows)'),
        q(''),
        q(''),
        q(visibleTotals.budgetedHours.toFixed(2)),
        q(visibleTotals.actualHoursInMatrix.toFixed(2)),
        q(visibleTotals.variance.toFixed(2)),
        visibleTotals.pct == null ? q('') : q(Number(visibleTotals.pct.toFixed(2))),
      ].join(',')
    )
    const t = data.totals
    lines.push([q('Total hours on PO (all approved entries)'), q(t.actualHoursAllEntries.toFixed(2))].join(','))
    if (t.unmatchedActualHours > 0) {
      lines.push([q('Unmatched hours (not on matrix rows)'), q(t.unmatchedActualHours.toFixed(2))].join(','))
    }
    const csvContent = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const base = safeFileBase(fileBaseName || reportTitle || 'project-matrix')
    const day = new Date().toISOString().split('T')[0]
    a.download = `project-matrix_${base}_${day}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  const hasRows = data && data.rows.length > 0
  const isFiltered = filterText.trim().length > 0
  const showTable = hasRows && sortedRows.length > 0

  return (
    <div className="report-print-container bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Project matrix (system × deliverable × activity)
          </h2>
          {reportTitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 break-words">{reportTitle}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 print:text-gray-700">
            Generated {new Date().toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 print:hidden">
            Budgeted hours from bid conversion vs actual hours from approved timesheets on this PO (matched by system, deliverable, and activity).
            <span className="block mt-1">Var (h) = budget − actual (positive means under budget).</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden shrink-0">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!hasRows || sortedRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!hasRows || sortedRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Use your browser print dialog to save as PDF"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
      </div>

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

      {hasRows && (
        <div className="mb-4 print:hidden">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Filter rows</label>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search system, deliverable, activity, or hours…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          {isFiltered && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Showing {sortedRows.length} of {data!.rows.length} rows
            </p>
          )}
        </div>
      )}

      {hasRows && isFiltered && sortedRows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6">No rows match your filter.</p>
      )}

      {showTable && (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('system')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    System
                    <SortIcon col="system" />
                  </button>
                </th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('deliverable')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Deliverable
                    <SortIcon col="deliverable" />
                  </button>
                </th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('activity')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Activity
                    <SortIcon col="activity" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('budget')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Budget (h)
                    <SortIcon col="budget" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('actual')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Actual (h)
                    <SortIcon col="actual" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('variance')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Var (h)
                    <SortIcon col="variance" />
                  </button>
                </th>
                <th className="text-right py-2 pl-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('pct')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Budget %
                    <SortIcon col="pct" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
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
                  {isFiltered ? 'Totals (visible rows)' : 'Totals (matrix rows)'}
                </td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.budgetedHours)}</td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.actualHoursInMatrix)}</td>
                <td className="text-right py-3 px-2 tabular-nums">{fmtVariance(visibleTotals.variance)}</td>
                <td className="text-right py-3 pl-2 tabular-nums text-gray-600 dark:text-gray-400">
                  {visibleTotals.pct == null ? '—' : `${visibleTotals.pct.toFixed(0)}%`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && data.totals.unmatchedActualHours > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-4 print:text-amber-900">
          {formatHours(data.totals.unmatchedActualHours)} billed on this PO do not match a matrix row (missing system/deliverable/activity on
          timesheet entries, or combo not in the matrix).
        </p>
      )}

      {hasRows && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          All approved timesheets · total hours on PO: {formatHours(data!.totals.actualHoursAllEntries)}
        </p>
      )}
    </div>
  )
}
