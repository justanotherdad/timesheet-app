'use client'

/**
 * "By individual" tab on the Project Budget screen.
 *
 * Renders a budget-vs-actuals table with one row per person who appears on
 * this PO — either as a budgeted resource on the source bid sheet or as an
 * actual logger of approved timesheet hours. Footer carries the simple-mean
 * average rate, totals across each numeric column, and Budget Remaining
 * (PO original_amount − total expended − Σ expenses).
 *
 * Each Employee cell is clickable. Real users (rows with a userId) open a
 * modal listing all timesheets they have on this PO; each row links to
 * /dashboard/timesheets/[id] in a new tab. Placeholder / "Unassigned" rows
 * are not clickable since they don't correspond to a real user.
 *
 * On mobile the table collapses into a stack of cards so the columns don't
 * have to fight for horizontal space.
 */

import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, Printer, RefreshCcw } from 'lucide-react'

type IndividualRow = {
  userId: string | null
  name: string
  title: string | null
  rate: number | null
  budgetHours: number
  budgetCost: number
  expendedHours: number
  expendedCost: number
}

type ByIndividualPayload = {
  rows: IndividualRow[]
  totals: {
    budgetHours: number
    budgetCost: number
    expendedHours: number
    expendedCost: number
  }
  averageRate: number
  budgetRemaining: number
  originalPoAmount: number
  expensesTotal: number
}

type EmployeeTimesheetRow = {
  timesheetId: string
  weekEnding: string
  status: string
  hoursOnPo: number
  costOnPo: number
}

type EmployeeTimesheetsPayload = {
  user: { id: string; name: string | null; title: string | null } | null
  rows: EmployeeTimesheetRow[]
  totals: { hours: number; cost: number }
}

type ProjectByIndividualViewProps = {
  poId: string
  refreshTick: number
  reportTitle?: string
  fileBaseName?: string
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtRate = (n: number | null) =>
  n == null ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHours = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ProjectByIndividualView({
  poId,
  refreshTick,
  reportTitle,
  fileBaseName,
}: ProjectByIndividualViewProps) {
  const [data, setData] = useState<ByIndividualPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [employeeOpen, setEmployeeOpen] = useState<{ userId: string; name: string } | null>(null)
  const [employeeData, setEmployeeData] = useState<EmployeeTimesheetsPayload | null>(null)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [employeeError, setEmployeeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/by-individual`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      setData(body as ByIndividualPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => {
    load()
  }, [load, refreshTick])

  const openEmployee = async (userId: string, name: string) => {
    setEmployeeOpen({ userId, name })
    setEmployeeLoading(true)
    setEmployeeError(null)
    setEmployeeData(null)
    try {
      const res = await fetch(`/api/budget/${poId}/individual/${userId}/timesheets`, {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      setEmployeeData(body as EmployeeTimesheetsPayload)
    } catch (e) {
      setEmployeeError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setEmployeeLoading(false)
    }
  }

  const closeEmployee = () => {
    setEmployeeOpen(null)
    setEmployeeData(null)
    setEmployeeError(null)
  }

  const exportCsv = () => {
    if (!data) return
    const q = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`
    const headers = [
      'Employee', 'Title', 'Rate', 'Budget Hours', 'Expended Hours', 'Budget Cost', 'Expended Cost',
    ]
    const lines: string[] = []
    if (reportTitle) lines.push([q('Report'), q(reportTitle)].join(','))
    lines.push([q('Generated'), q(new Date().toISOString())].join(','))
    lines.push([q('View'), q('By individual')].join(','))
    lines.push(headers.join(','))
    for (const r of data.rows) {
      lines.push([
        q(r.name), q(r.title ?? ''), q(r.rate == null ? '' : r.rate.toFixed(2)),
        q(r.budgetHours.toFixed(2)), q(r.expendedHours.toFixed(2)),
        q(r.budgetCost.toFixed(2)), q(r.expendedCost.toFixed(2)),
      ].join(','))
    }
    lines.push([
      q('Average rate'), q(''), q(data.averageRate.toFixed(2)),
      q(data.totals.budgetHours.toFixed(2)), q(data.totals.expendedHours.toFixed(2)),
      q(data.totals.budgetCost.toFixed(2)), q(data.totals.expendedCost.toFixed(2)),
    ].join(','))
    lines.push([q('Original PO amount'), q(''), q(''), q(''), q(''), q(''), q(data.originalPoAmount.toFixed(2))].join(','))
    lines.push([q('Expenses (PO)'), q(''), q(''), q(''), q(''), q(''), q(data.expensesTotal.toFixed(2))].join(','))
    lines.push([q('Budget remaining'), q(''), q(''), q(''), q(''), q(''), q(data.budgetRemaining.toFixed(2))].join(','))

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = (fileBaseName || `budget-by-individual-${poId}`).replace(/[^A-Za-z0-9_-]+/g, '_')
    a.download = `${name}_by-individual.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPdf = () => {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By individual</h2>
          {reportTitle && <p className="text-xs text-gray-500 dark:text-gray-400">{reportTitle}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Per-resource budget vs actuals. Click an employee to see all their timesheets on this PO.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={printPdf}
            disabled={!data}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {data && data.rows.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No people are budgeted or have logged hours on this PO yet.
        </div>
      )}

      {/* Desktop table */}
      {data && data.rows.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Employee</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Title</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Rate</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Budget Hrs</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Expended Hrs</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Budget Cost</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Expended Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.rows.map((r, i) => (
                  <tr key={r.userId ?? `placeholder-${i}`}>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                      {r.userId ? (
                        <button
                          type="button"
                          onClick={() => openEmployee(r.userId!, r.name)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                          title="Show all timesheets for this person on this PO"
                        >
                          {r.name}
                        </button>
                      ) : (
                        <span className="italic text-gray-500 dark:text-gray-400">{r.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.title || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRate(r.rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.budgetHours)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.expendedHours)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.budgetCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.expendedCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-600">
                <tr>
                  <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">Totals</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400" colSpan={1}>
                    Avg rate: {fmtRate(data.averageRate)}
                  </td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtHours(data.totals.budgetHours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtHours(data.totals.expendedHours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(data.totals.budgetCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(data.totals.expendedCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="md:hidden space-y-2">
            {data.rows.map((r, i) => (
              <div
                key={r.userId ?? `placeholder-${i}`}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {r.userId ? (
                      <button
                        type="button"
                        onClick={() => openEmployee(r.userId!, r.name)}
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline truncate text-left"
                      >
                        {r.name}
                      </button>
                    ) : (
                      <span className="font-medium italic text-gray-500 dark:text-gray-400 truncate">{r.name}</span>
                    )}
                    {r.title && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.title}</p>}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">{fmtRate(r.rate)}/hr</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Budget</div>
                    <div className="tabular-nums">{fmtHours(r.budgetHours)} hrs</div>
                    <div className="tabular-nums text-gray-700 dark:text-gray-300">{fmtMoney(r.budgetCost)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Expended</div>
                    <div className="tabular-nums">{fmtHours(r.expendedHours)} hrs</div>
                    <div className="tabular-nums text-gray-700 dark:text-gray-300">{fmtMoney(r.expendedCost)}</div>
                  </div>
                </div>
              </div>
            ))}
            {/* Mobile totals card */}
            <div className="rounded-lg border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm">
              <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Totals</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Avg rate</div>
                  <div className="tabular-nums">{fmtRate(data.averageRate)}/hr</div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Budget remaining</div>
                  <div className={`tabular-nums font-semibold ${data.budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {fmtMoney(data.budgetRemaining)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Total budget</div>
                  <div className="tabular-nums">{fmtMoney(data.totals.budgetCost)}</div>
                </div>
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Total expended</div>
                  <div className="tabular-nums">{fmtMoney(data.totals.expendedCost)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer summary line shown for desktop only — mobile summary card above already covers this */}
          <div className="hidden md:flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm text-gray-700 dark:text-gray-300 mt-2">
            <span>
              <span className="text-gray-500 dark:text-gray-400">Original PO:</span>{' '}
              <span className="tabular-nums font-medium">{fmtMoney(data.originalPoAmount)}</span>
            </span>
            <span>
              <span className="text-gray-500 dark:text-gray-400">Expenses:</span>{' '}
              <span className="tabular-nums font-medium">{fmtMoney(data.expensesTotal)}</span>
            </span>
            <span className={data.budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : ''}>
              <span className="text-gray-500 dark:text-gray-400">Budget remaining:</span>{' '}
              <span className="tabular-nums font-semibold">{fmtMoney(data.budgetRemaining)}</span>
            </span>
          </div>
        </>
      )}

      {/* Employee timesheets popup */}
      {employeeOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-0 sm:p-4 flex items-stretch sm:items-center justify-center"
          onClick={closeEmployee}
        >
          <div
            className="bg-white dark:bg-gray-800 w-full sm:max-w-2xl sm:rounded-xl shadow-xl flex flex-col max-h-screen sm:max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{employeeOpen.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">All timesheets on this PO</p>
              </div>
              <button
                type="button"
                onClick={closeEmployee}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto px-3 sm:px-4 py-3">
              {employeeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : employeeError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{employeeError}</p>
              ) : !employeeData || employeeData.rows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  This person hasn&apos;t logged any hours on this PO.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-gray-700 dark:text-gray-300">
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 pr-2 font-medium">Week ending</th>
                      <th className="text-left py-2 pr-2 font-medium">Status</th>
                      <th className="text-right py-2 pr-2 font-medium">Hours on PO</th>
                      <th className="text-right py-2 pr-2 font-medium">Cost on PO</th>
                      <th className="text-right py-2 pl-2 font-medium">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeData.rows.map((r) => (
                      <tr key={r.timesheetId} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 pr-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{r.weekEnding}</td>
                        <td className="py-2 pr-2 text-gray-700 dark:text-gray-300 capitalize">{r.status}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{r.hoursOnPo.toFixed(2)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(r.costOnPo)}</td>
                        <td className="py-2 pl-2 text-right">
                          <a
                            href={`/dashboard/timesheets/${r.timesheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-300 dark:border-gray-600 font-medium text-gray-900 dark:text-gray-100">
                      <td className="py-2 pr-2" colSpan={2}>Totals</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{employeeData.totals.hours.toFixed(2)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(employeeData.totals.cost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
