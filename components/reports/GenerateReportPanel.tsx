'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Trash2, FileText, X } from 'lucide-react'
import GeneratedReportView from './GeneratedReportView'
import TimesheetReportView from './TimesheetReportView'
import { formatWeekEnding, getTimesheetReportWeekEndingOptions } from '@/lib/utils'
import type {
  GeneratedReportKind,
  GeneratedReportListItem,
  GeneratedReportSnapshot,
  TimesheetReportSnapshot,
} from '@/lib/generated-report'
import { isTimesheetSnapshot } from '@/lib/generated-report'

interface PoOption {
  id: string
  poNumber: string
  projectName: string
  clientName: string
  budgetType: 'project' | 'basic'
}

export default function GenerateReportPanel() {
  const [reports, setReports] = useState<GeneratedReportListItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [search, setSearch] = useState('')
  const [listError, setListError] = useState<string | null>(null)

  const [viewing, setViewing] = useState<{
    title: string
    snapshot: GeneratedReportSnapshot | TimesheetReportSnapshot
    saved: boolean
  } | null>(null)
  const [savingLive, setSavingLive] = useState(false)
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null)
  const [listType, setListType] = useState<'all' | GeneratedReportKind>('all')

  const [wizardOpen, setWizardOpen] = useState(false)

  const loadList = useCallback(async (q: string, type: 'all' | GeneratedReportKind) => {
    setLoadingList(true)
    setListError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type !== 'all') params.set('type', type)
      const res = await fetch(`/api/reports/generated?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load reports')
      const data = await res.json()
      setReports(data.reports || [])
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => loadList(search, listType), 250)
    return () => clearTimeout(t)
  }, [search, listType, loadList])

  const openReport = async (id: string) => {
    setLoadingReportId(id)
    try {
      const res = await fetch(`/api/reports/generated/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to open report')
      const data = await res.json()
      setViewing({ title: data.title, snapshot: data.snapshot, saved: true })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to open report')
    } finally {
      setLoadingReportId(null)
    }
  }

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this saved report? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/reports/generated/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete')
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  if (viewing) {
    const back = () => {
      setViewing(null)
      loadList(search, listType)
    }
    if (isTimesheetSnapshot(viewing.snapshot)) {
      return (
        <TimesheetReportView
          title={viewing.title}
          snapshot={viewing.snapshot}
          onBack={back}
          saving={savingLive}
          onSave={
            viewing.saved
              ? undefined
              : async () => {
                  setSavingLive(true)
                  try {
                    const res = await fetch('/api/reports/generate-timesheet', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        save: true,
                        title: viewing.title,
                        snapshot: viewing.snapshot,
                      }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(data.error || 'Failed to save report')
                    setViewing((prev) => (prev ? { ...prev, saved: true } : prev))
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Failed to save report')
                  } finally {
                    setSavingLive(false)
                  }
                }
          }
        />
      )
    }
    return (
      <GeneratedReportView
        title={viewing.title}
        snapshot={viewing.snapshot as GeneratedReportSnapshot}
        onBack={back}
      />
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generated Reports</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Saved reports (kept for 1 year). Search by title, PO, project, or client.</p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700"
        >
          <Plus className="h-5 w-5" /> Generate Report
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[16rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, PO number, project, client…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            />
          </div>
          <select
            value={listType}
            onChange={(e) => setListType(e.target.value as 'all' | GeneratedReportKind)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="all">All types</option>
            <option value="budget_status">Budget Status</option>
            <option value="timesheet">Timesheet</option>
          </select>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-orange-600" />
          </div>
        ) : listError ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm">
            {listError}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>{search ? 'No reports match your search.' : 'No reports yet. Click “Generate Report” to create one.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.reportType === 'timesheet' ? 'Timesheet Report' : 'Budget Status'}
                    {r.clientNames.length > 0 ? ` · ${r.clientNames.join(', ')}` : ''}
                    {r.poNumbers.length > 0 ? ` · PO ${r.poNumbers.join(', ')}` : ''}
                    {` · ${new Date(r.createdAt).toLocaleDateString('en-US')}`}
                    {r.createdByName ? ` · ${r.createdByName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openReport(r.id)}
                    disabled={loadingReportId === r.id}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {loadingReportId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReport(r.id)}
                    className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                    title="Delete report"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wizardOpen && (
        <GenerateWizard
          onClose={() => setWizardOpen(false)}
          onGenerated={(title, snapshot, saved) => {
            setWizardOpen(false)
            setViewing({ title, snapshot, saved })
          }}
        />
      )}
    </div>
  )
}

function formatMonthCheckboxLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

/** Fallback calendar months (newest first) when activity lookup finds none. */
function recentCalendarMonths(count = 36): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}`)
  }
  return out
}

function GenerateWizard({
  onClose,
  onGenerated,
}: {
  onClose: () => void
  onGenerated: (
    title: string,
    snapshot: GeneratedReportSnapshot | TimesheetReportSnapshot,
    saved: boolean
  ) => void
}) {
  const [reportKind, setReportKind] = useState<GeneratedReportKind | null>(null)
  const weekOptions = useMemo(() => getTimesheetReportWeekEndingOptions(), [])
  const [selectedWeeks, setSelectedWeeks] = useState<Set<string>>(new Set())
  const [weekSearch, setWeekSearch] = useState('')
  const [tsClients, setTsClients] = useState<{ id: string; name: string }[]>([])
  const [tsEmployees, setTsEmployees] = useState<{ id: string; name: string; siteIds: string[] }[]>([])
  const [loadingTsOptions, setLoadingTsOptions] = useState(false)
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [clientSearch, setClientSearch] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [options, setOptions] = useState<PoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poSearch, setPoSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeHours, setIncludeHours] = useState<boolean | null>(null)
  const [rates, setRates] = useState<Record<string, string>>({})
  const [includeBillableActivities, setIncludeBillableActivities] = useState(false)
  const [includeBillableCost, setIncludeBillableCost] = useState(false)
  /** null = not chosen yet; true = all activity months; false = pick specific */
  const [monthMode, setMonthMode] = useState<'all' | 'specific' | null>(null)
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set())
  const [activityMonths, setActivityMonths] = useState<string[]>([])
  const [loadingMonths, setLoadingMonths] = useState(false)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (reportKind !== 'timesheet') return
    let cancelled = false
    ;(async () => {
      setLoadingTsOptions(true)
      try {
        const res = await fetch('/api/reports/generate-timesheet/options', { cache: 'no-store' })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load employees')
        const data = await res.json()
        if (!cancelled) {
          setTsClients(data.clients || [])
          setTsEmployees(data.employees || [])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load employees')
      } finally {
        if (!cancelled) setLoadingTsOptions(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reportKind])

  useEffect(() => {
    if (reportKind !== 'budget_status') return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/reports/generate/options', { cache: 'no-store' })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load POs')
        const data = await res.json()
        if (!cancelled) setOptions(data.options || [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load POs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reportKind])

  const wantBillableTables = includeBillableActivities || includeBillableCost

  useEffect(() => {
    if (!wantBillableTables || selected.size === 0) {
      setActivityMonths([])
      setMonthMode(null)
      setSelectedMonths(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingMonths(true)
      try {
        const res = await fetch(
          `/api/reports/generate/activity-months?poIds=${encodeURIComponent([...selected].join(','))}`,
          { cache: 'no-store' }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load months')
        if (!cancelled) {
          const months = (data.months || []) as string[]
          setActivityMonths(months)
          setSelectedMonths((prev) => {
            const next = new Set<string>()
            for (const m of prev) if (months.includes(m) || recentCalendarMonths().includes(m)) next.add(m)
            return next
          })
        }
      } catch (e) {
        if (!cancelled) {
          setActivityMonths([])
          setError(e instanceof Error ? e.message : 'Failed to load months')
        }
      } finally {
        if (!cancelled) setLoadingMonths(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wantBillableTables, selected])

  /** Months shown for Specific mode: activity months when available, else recent calendar months. */
  const selectableMonths = useMemo(() => {
    if (activityMonths.length > 0) return [...activityMonths].sort().reverse()
    return recentCalendarMonths(36)
  }, [activityMonths])

  const filteredOptions = useMemo(() => {
    const q = poSearch.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      [o.poNumber, o.projectName, o.clientName].join(' ').toLowerCase().includes(q)
    )
  }, [options, poSearch])

  const groupedByClient = useMemo(() => {
    const map = new Map<string, PoOption[]>()
    for (const o of filteredOptions) {
      if (!map.has(o.clientName)) map.set(o.clientName, [])
      map.get(o.clientName)!.push(o)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filteredOptions])

  const selectedOptions = useMemo(() => options.filter((o) => selected.has(o.id)), [options, selected])
  const selectedBasic = useMemo(() => selectedOptions.filter((o) => o.budgetType === 'basic'), [selectedOptions])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const o of filteredOptions) next.add(o.id)
      return next
    })

  const clearSelection = () => setSelected(new Set())

  const toggleMonth = (monthKey: string) =>
    setSelectedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(monthKey)) next.delete(monthKey)
      else next.add(monthKey)
      return next
    })

  const ratesNeeded = includeHours === true && selectedBasic.length > 0
  const ratesValid = !ratesNeeded || selectedBasic.every((o) => Number(rates[o.id]) > 0)
  const monthsValid =
    !wantBillableTables ||
    monthMode === 'all' ||
    (monthMode === 'specific' && selectedMonths.size > 0)
  const canGenerate =
    selected.size > 0 && includeHours !== null && ratesValid && monthsValid && !submitting

  const generate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const blendedRates: Record<string, number> = {}
      for (const o of selectedBasic) {
        // Preserve cents — do not round to whole dollars.
        const raw = String(rates[o.id] ?? '').trim()
        const v = Number(raw)
        if (Number.isFinite(v) && v > 0) blendedRates[o.id] = v
      }
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poIds: [...selected],
          includeHours,
          blendedRates,
          title: title.trim() || undefined,
          includeBillableActivities,
          includeBillableCost,
          billableMonthsAll: wantBillableTables && monthMode === 'all',
          billableMonths:
            wantBillableTables && monthMode === 'specific' ? [...selectedMonths].sort() : [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to generate report')
      onGenerated(data.title, data.snapshot, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report')
      setSubmitting(false)
    }
  }

  const filteredWeeks = useMemo(() => {
    const q = weekSearch.trim().toLowerCase()
    if (!q) return weekOptions
    return weekOptions.filter((we) => formatWeekEnding(we).toLowerCase().includes(q) || we.includes(q))
  }, [weekOptions, weekSearch])

  const toggleWeek = (we: string) =>
    setSelectedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(we)) next.delete(we)
      else next.add(we)
      return next
    })

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return tsClients
    return tsClients.filter((c) => c.name.toLowerCase().includes(q))
  }, [tsClients, clientSearch])

  const employeesForClients = useMemo(() => {
    if (selectedClients.size === 0) return tsEmployees
    return tsEmployees.filter((e) => e.siteIds.some((id) => selectedClients.has(id)))
  }, [tsEmployees, selectedClients])

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    if (!q) return employeesForClients
    return employeesForClients.filter((e) => e.name.toLowerCase().includes(q))
  }, [employeesForClients, employeeSearch])

  useEffect(() => {
    setSelectedEmployees((prev) => {
      if (prev.size === 0) return prev
      const allowed = new Set(employeesForClients.map((e) => e.id))
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (allowed.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [employeesForClients])

  const toggleClient = (id: string) =>
    setSelectedClients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleEmployee = (id: string) =>
    setSelectedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const generateTimesheet = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate-timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekEndings: [...selectedWeeks],
          clientIds: [...selectedClients],
          employeeIds: [...selectedEmployees],
          title: title.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to generate report')
      onGenerated(data.title, data.snapshot, false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-xl">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generate Report</h3>
            {reportKind && (
              <button
                type="button"
                onClick={() => {
                  setReportKind(null)
                  setError(null)
                }}
                className="text-xs text-orange-600 dark:text-orange-400 hover:underline mt-0.5"
              >
                Change type
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {reportKind === null && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Choose report type</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReportKind('budget_status')}
                  className="text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-600"
                >
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Budget Status Report</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    PO budget vs actual, optional hours and billable tables. Saved for 1 year.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setReportKind('timesheet')}
                  className="text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-600"
                >
                  <p className="font-semibold text-gray-900 dark:text-gray-100">Timesheet Report</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Employee timesheet status by week ending, including people who have not created a sheet.
                  </p>
                </button>
              </div>
            </section>
          )}

          {reportKind === 'timesheet' && (
            <>
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">1. Choose week ending(s)</h4>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedWeeks(new Set(filteredWeeks))}
                      className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                    >
                      Select all{weekSearch.trim() ? ' filtered' : ''}
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedWeeks(new Set())}
                      disabled={selectedWeeks.size === 0}
                      className="text-gray-600 dark:text-gray-400 hover:underline font-medium disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Newest first: two weeks after last week ending, then back a full year. Select one or more.
                  Employees without a timesheet still appear as Not Created.
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={weekSearch}
                    onChange={(e) => setWeekSearch(e.target.value)}
                    placeholder="Filter week endings…"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredWeeks.map((we) => {
                    const checked = selectedWeeks.has(we)
                    return (
                      <label
                        key={we}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                          checked ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWeek(we)}
                          className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{formatWeekEnding(we)}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  {selectedWeeks.size === 0 ? 'No weeks selected yet.' : `${selectedWeeks.size} week(s) selected`}
                </p>
              </section>
              {selectedWeeks.size > 0 && (
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">2. Clients and employees</h4>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Leave a list empty for All. Choosing clients narrows the employee list to people assigned to those clients.
                  </p>
                  {loadingTsOptions ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading clients and employees…
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Clients</span>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setSelectedClients(new Set(filteredClients.map((c) => c.id)))}
                              className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                            >
                              Select all{clientSearch.trim() ? ' filtered' : ''}
                            </button>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedClients(new Set())}
                              disabled={selectedClients.size === 0}
                              className="text-gray-600 dark:text-gray-400 hover:underline font-medium disabled:opacity-40"
                            >
                              All
                            </button>
                          </div>
                        </div>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            placeholder="Filter clients…"
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                          {filteredClients.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No clients match.</p>
                          ) : (
                            filteredClients.map((c) => {
                              const checked = selectedClients.has(c.id)
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                                    checked ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleClient(c.id)}
                                    className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                                  />
                                  <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                                </label>
                              )
                            })
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                          {selectedClients.size === 0 ? 'All clients' : `${selectedClients.size} client(s) selected`}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Employees</span>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setSelectedEmployees(new Set(filteredEmployees.map((e) => e.id)))}
                              className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                            >
                              Select all{employeeSearch.trim() ? ' filtered' : ''}
                            </button>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedEmployees(new Set())}
                              disabled={selectedEmployees.size === 0}
                              className="text-gray-600 dark:text-gray-400 hover:underline font-medium disabled:opacity-40"
                            >
                              All
                            </button>
                          </div>
                        </div>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            placeholder="Filter employees…"
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                          {filteredEmployees.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No employees match.</p>
                          ) : (
                            filteredEmployees.map((emp) => {
                              const checked = selectedEmployees.has(emp.id)
                              return (
                                <label
                                  key={emp.id}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${
                                    checked ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEmployee(emp.id)}
                                    className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                                  />
                                  <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{emp.name}</span>
                                </label>
                              )
                            })
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                          {selectedEmployees.size === 0
                            ? `All employees${selectedClients.size > 0 ? ' for selected clients' : ''}`
                            : `${selectedEmployees.size} employee(s) selected`}
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {selectedWeeks.size > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Report name (optional)</h4>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-generated from week endings if left blank"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </section>
              )}
            </>
          )}

          {reportKind === 'budget_status' && (
            <>
          {/* Step 1: choose POs */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">1. Choose PO(s) to include</h4>
              {!loading && options.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                  >
                    Select all{poSearch.trim() ? ' filtered' : ''}
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selected.size === 0}
                    className="text-gray-600 dark:text-gray-400 hover:underline font-medium disabled:opacity-40 disabled:no-underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Check each PO you want in the report. Only POs you can access are listed.
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="Filter this list by PO, project, or client…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>
            ) : options.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">You don’t have budget access to any POs.</p>
            ) : filteredOptions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No POs match your filter.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                {groupedByClient.map(([client, opts]) => (
                  <div key={client}>
                    <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700/70 text-xs font-semibold text-gray-700 dark:text-gray-200 sticky top-0 border-b border-gray-200 dark:border-gray-700">
                      {client}
                    </div>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {opts.map((o) => {
                        const checked = selected.has(o.id)
                        return (
                          <li key={o.id}>
                            <label
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-orange-50 dark:bg-orange-900/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(o.id)}
                                className="h-4 w-4 shrink-0 rounded border-gray-400 dark:border-gray-500 text-orange-600 focus:ring-orange-500 focus:ring-offset-0 dark:bg-gray-800"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                  PO {o.poNumber}
                                </span>
                                {o.projectName ? (
                                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {o.projectName}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded shrink-0 ${
                                  o.budgetType === 'project'
                                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                }`}
                              >
                                {o.budgetType}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              {selected.size === 0 ? 'No POs selected yet.' : `${selected.size} PO(s) selected`}
            </p>
          </section>

          {/* Step 2: include hours? */}
          {selected.size > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">2. Include original / actual / remaining hours?</h4>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input type="radio" name="incHours" checked={includeHours === true} onChange={() => setIncludeHours(true)} /> Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input type="radio" name="incHours" checked={includeHours === false} onChange={() => setIncludeHours(false)} /> No (dollars only)
                </label>
              </div>
            </section>
          )}

          {/* Step 3: blended rates for basic budgets */}
          {ratesNeeded && (
            <section>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">3. Blended rate for basic budget PO(s)</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Basic budgets have no matrix, so we convert dollars to hours using a blended $/hr rate.</p>
              <div className="space-y-2">
                {selectedBasic.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
                      {o.poNumber}{o.projectName ? ` — ${o.projectName}` : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rates[o.id] ?? ''}
                        onChange={(e) => setRates((p) => ({ ...p, [o.id]: e.target.value }))}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        placeholder="0.00"
                        className="w-28 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <span className="text-sm text-gray-500">/hr</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Step 4: billable tables + months */}
          {selected.size > 0 && includeHours !== null && (
            <section>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                4. Billable Activities / Cost tables (optional)
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Same employee × week tables as on the budget screen, grouped by month, per PO. Cost uses each employee’s bill rate.
              </p>
              <div className="space-y-2 mb-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={includeBillableActivities}
                    onChange={(e) => setIncludeBillableActivities(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                  />
                  Include Billable Activities (hours)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={includeBillableCost}
                    onChange={(e) => setIncludeBillableCost(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                  />
                  Include Billable Cost ($)
                </label>
              </div>

              {wantBillableTables && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Months to include</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="monthMode"
                        checked={monthMode === 'all'}
                        onChange={() => {
                          setMonthMode('all')
                          setSelectedMonths(new Set())
                        }}
                        className="mt-0.5 h-4 w-4 border-gray-400 text-orange-600 focus:ring-orange-500"
                      />
                      <span>
                        All months with timesheet activity on the selected PO(s)
                        {activityMonths.length > 0 ? (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {activityMonths.length} month{activityMonths.length === 1 ? '' : 's'} with activity
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="monthMode"
                        checked={monthMode === 'specific'}
                        onChange={() => setMonthMode('specific')}
                        className="mt-0.5 h-4 w-4 border-gray-400 text-orange-600 focus:ring-orange-500"
                      />
                      <span>Specific months</span>
                    </label>
                  </div>

                  {monthMode === 'specific' && (
                    <div className="pl-6 space-y-2">
                      {loadingMonths ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading months…
                        </div>
                      ) : (
                        <>
                          {activityMonths.length === 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              No activity months detected for these POs — showing recent calendar months to choose from.
                            </p>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                            {selectableMonths.map((m) => (
                              <label
                                key={m}
                                className="flex items-center gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-200 px-1 py-0.5"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedMonths.has(m)}
                                  onChange={() => toggleMonth(m)}
                                  className="h-3.5 w-3.5 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                                />
                                {formatMonthCheckboxLabel(m)}
                              </label>
                            ))}
                          </div>
                          {selectedMonths.size === 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              Select at least one month.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {monthMode === null && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Choose All months or Specific months.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Step 5: title */}
          {selected.size > 0 && includeHours !== null && ratesValid && (
            <section>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Report name (optional)</h4>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-generated from PO / project if left blank"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </section>
          )}
            </>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium hover:bg-gray-300 dark:hover:bg-gray-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={reportKind === 'timesheet' ? generateTimesheet : generate}
            disabled={
              reportKind === 'timesheet'
                ? selectedWeeks.size === 0 || submitting
                : reportKind !== 'budget_status' || !canGenerate
            }
            className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
