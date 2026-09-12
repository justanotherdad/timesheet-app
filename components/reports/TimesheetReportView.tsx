'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Download, Loader2, Printer, Save } from 'lucide-react'
import { formatWeekEnding } from '@/lib/utils'
import type { TimesheetReportSnapshot, TimesheetReportStatus } from '@/lib/generated-report'
import MultiSelectDropdown from '@/components/admin/MultiSelectDropdown'

const STATUS_LABEL: Record<TimesheetReportStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  not_created: 'Not Created',
}

const STATUS_OPTIONS = [
  { id: 'not_created', label: 'Not Created' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

const TYPE_OPTIONS = [
  { id: 'internal', label: 'Internal' },
  { id: 'external', label: 'External' },
  { id: 'none', label: '—' },
]

type SortKey = 'employeeName' | 'weekEnding' | 'status' | 'employeeType' | 'createdAt' | 'submittedAt' | 'approvedAt'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

function typeLabel(t: 'internal' | 'external' | null): string {
  if (t === 'internal') return 'Internal'
  if (t === 'external') return 'External'
  return '—'
}

function typeKey(t: 'internal' | 'external' | null): string {
  return t === 'internal' || t === 'external' ? t : 'none'
}

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

interface TimesheetReportViewProps {
  title: string
  snapshot: TimesheetReportSnapshot
  onBack?: () => void
  /** When set, the live report can be frozen into the 1-year repository. */
  onSave?: () => Promise<void>
  saving?: boolean
}

export default function TimesheetReportView({
  title,
  snapshot,
  onBack,
  onSave,
  saving = false,
}: TimesheetReportViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('weekEnding')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([])

  const generatedLabel = `Generated ${new Date(snapshot.generatedAt).toLocaleString('en-US')} by ${snapshot.generatedByName}.`

  const employeeOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of snapshot.rows) {
      if (!seen.has(r.userId)) seen.set(r.userId, r.employeeName)
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [snapshot.rows])

  const handlePrint = () => {
    const previousTitle = document.title
    const safeTitle = (title || 'Timesheet Report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Timesheet Report'
    document.title = safeTitle

    const style = document.createElement('style')
    style.setAttribute('data-generated-report-print', '')
    style.textContent = '@page { size: letter landscape; margin: 0.45in; }'
    document.head.appendChild(style)

    let restored = false
    const cleanup = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      style.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    window.setTimeout(cleanup, 60000)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'weekEnding' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1" />
    )
  }

  const filtered = useMemo(() => {
    return snapshot.rows.filter((r) => {
      if (statusFilter.length > 0 && !statusFilter.includes(r.status)) return false
      if (typeFilter.length > 0 && !typeFilter.includes(typeKey(r.employeeType))) return false
      if (employeeFilter.length > 0 && !employeeFilter.includes(r.userId)) return false
      return true
    })
  }, [snapshot.rows, statusFilter, typeFilter, employeeFilter])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'employeeName') cmp = a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' })
      else if (sortKey === 'weekEnding') cmp = a.weekEnding.localeCompare(b.weekEnding)
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
      else if (sortKey === 'employeeType') cmp = (a.employeeType || '').localeCompare(b.employeeType || '')
      else if (sortKey === 'createdAt') cmp = (a.createdAt || '').localeCompare(b.createdAt || '')
      else if (sortKey === 'submittedAt') cmp = (a.submittedAt || '').localeCompare(b.submittedAt || '')
      else cmp = (a.approvedAt || '').localeCompare(b.approvedAt || '')
      if (cmp !== 0) return cmp * dir
      const nameCmp = a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' })
      if (nameCmp !== 0) return nameCmp
      return a.weekEnding.localeCompare(b.weekEnding)
    })
  }, [filtered, sortKey, sortDir])

  const hasFilters = statusFilter.length > 0 || typeFilter.length > 0 || employeeFilter.length > 0

  const handleExportCsv = () => {
    const header = [
      'Employee',
      'Type',
      'Week Ending',
      'Status',
      'Created',
      'Submitted for Approval',
      'Final Approval',
    ]
    const lines = [header.map(csvCell).join(',')]
    for (const r of sorted) {
      lines.push(
        [
          csvCell(r.employeeName),
          csvCell(typeLabel(r.employeeType)),
          csvCell(formatWeekEnding(r.weekEnding)),
          csvCell(STATUS_LABEL[r.status]),
          csvCell(formatWhen(r.createdAt)),
          csvCell(formatWhen(r.submittedAt)),
          csvCell(formatWhen(r.approvedAt)),
        ].join(',')
      )
    }
    const csvContent = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeTitle = (title || 'Timesheet Report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Timesheet Report'
    a.download = `${safeTitle}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="generated-report report-print-container bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onSave && (
            <button
              type="button"
              onClick={() => onSave()}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Save report
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={sorted.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            title="Export current view to CSV"
          >
            <Download className="h-5 w-5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700"
          >
            <Printer className="h-5 w-5" /> Print / Export to PDF
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="hidden print:block gr-print-header">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #111827',
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '16pt', fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: '9pt' }}>{generatedLabel}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ctg-logo.png" alt="CTG" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 print:hidden">{generatedLabel}</p>

        <div className="print:hidden grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiSelectDropdown
            label="Employees"
            allLabel="All employees"
            options={employeeOptions}
            selected={employeeFilter}
            onChange={setEmployeeFilter}
          />
          <MultiSelectDropdown
            label="Status"
            allLabel="All statuses"
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <MultiSelectDropdown
            label="Employee type"
            allLabel="All types"
            options={TYPE_OPTIONS}
            selected={typeFilter}
            onChange={setTypeFilter}
          />
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 print:hidden">
          {sorted.length} row{sorted.length === 1 ? '' : 's'}
          {hasFilters ? ` (filtered from ${snapshot.rows.length})` : ''}
        </p>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-sm border border-gray-300 dark:border-gray-600">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                {(
                  [
                    ['employeeName', 'Employee'],
                    ['employeeType', 'Type'],
                    ['weekEnding', 'Week Ending'],
                    ['status', 'Status'],
                    ['createdAt', 'Created'],
                    ['submittedAt', 'Submitted for Approval'],
                    ['approvedAt', 'Final Approval'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="text-left px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 print:text-black">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center print:pointer-events-none"
                    >
                      {label} <span className="print:hidden"><SortIcon col={key} /></span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                sorted.map((r, i) => (
                  <tr key={`${r.userId}-${r.weekEnding}-${r.timesheetId || 'none'}-${i}`} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{r.employeeName}</td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{typeLabel(r.employeeType)}</td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black whitespace-nowrap">
                      {formatWeekEnding(r.weekEnding)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">
                      {STATUS_LABEL[r.status]}
                    </td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black whitespace-nowrap">
                      {formatWhen(r.createdAt)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black whitespace-nowrap">
                      {formatWhen(r.submittedAt)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black whitespace-nowrap">
                      {formatWhen(r.approvedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
