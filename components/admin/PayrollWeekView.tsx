'use client'

import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { PayrollDetailRow } from '@/lib/payroll'
import { formatHoursAmount } from '@/lib/utils'

type SortKey = keyof Pick<PayrollDetailRow, 'weekEnding' | 'employeeName' | 'employeeId' | 'earningType' | 'det' | 'detcode' | 'hours'>

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'weekEnding', label: 'Week Ending' },
  { key: 'employeeName', label: 'Employee Name' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'earningType', label: 'Earning Type' },
  { key: 'det', label: 'DET' },
  { key: 'detcode', label: 'DETCODE' },
  { key: 'hours', label: 'Hours', numeric: true },
]

export default function PayrollWeekView({
  rows,
  weekEndings,
}: {
  rows: PayrollDetailRow[]
  /** One or more week endings represented in `rows`; drives the export link. */
  weekEndings: string[]
}) {
  const [nameFilter, setNameFilter] = useState('')
  const [earningFilter, setEarningFilter] = useState('')
  const [detcodeFilter, setDetcodeFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('weekEnding')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const exportHref = `/api/admin/payroll/export?weeks=${encodeURIComponent(weekEndings.join(','))}`

  const earningOptions = useMemo(
    () => [...new Set(rows.map((r) => r.earningType))].sort(),
    [rows]
  )
  const detcodeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.detcode).filter(Boolean))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    const nf = nameFilter.trim().toLowerCase()
    let out = rows.filter((r) => {
      if (nf && !r.employeeName.toLowerCase().includes(nf) && !r.employeeId.toLowerCase().includes(nf)) return false
      if (earningFilter && r.earningType !== earningFilter) return false
      if (detcodeFilter && r.detcode !== detcodeFilter) return false
      return true
    })
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'hours') cmp = a.hours - b.hours
      else cmp = String(a[sortKey] ?? '').toLowerCase().localeCompare(String(b[sortKey] ?? '').toLowerCase())
      // Stable secondary sort by employee name.
      if (cmp === 0 && sortKey !== 'employeeName') {
        cmp = a.employeeName.toLowerCase().localeCompare(b.employeeName.toLowerCase())
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, nameFilter, earningFilter, detcodeFilter, sortKey, sortDir])

  const totalHours = filtered.reduce((s, r) => s + r.hours, 0)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'hours' ? 'desc' : 'asc')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search name / ID</label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by employee…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div className="min-w-[10rem]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Earning Type</label>
          <select
            value={earningFilter}
            onChange={(e) => setEarningFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">All</option>
            {earningOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[8rem]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">DETCODE</label>
          <select
            value={detcodeFilter}
            onChange={(e) => setDetcodeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">All</option>
            {detcodeOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <a
          href={exportHref}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {COLUMNS.map((c) => {
                const active = sortKey === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`px-4 py-3 font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.numeric ? 'justify-end' : ''}`}>
                      {c.label}
                      {active ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {filtered.map((r, i) => (
              <tr key={`${r.userId}-${r.detcode}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 whitespace-nowrap">{r.weekEnding}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.employeeName}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.employeeId || '—'}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.earningType}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.det || '—'}</td>
                <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.detcode || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(r.hours)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-700 font-semibold">
                <td colSpan={6} className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">Total ({filtered.length} rows)</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">{formatHoursAmount(totalHours)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
