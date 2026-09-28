'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { totalPtoHours } from '@/lib/pto-shared'
import type { PtoRequest, PtoRequestStatus } from '@/types/database'

type QueueRow = PtoRequest & { employee_name: string }
type HistoryRow = QueueRow & { reviewer_name: string | null }
type Tab = 'queue' | 'history' | 'calendar'
type StatusFilter = 'all' | Exclude<PtoRequestStatus, 'pending'>

function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

function statusClass(status: string): string {
  if (status === 'approved') return 'text-green-700 dark:text-green-400'
  if (status === 'denied') return 'text-red-600 dark:text-red-400'
  if (status === 'cancelled') return 'text-gray-500 dark:text-gray-400'
  return 'text-amber-700 dark:text-amber-400'
}

function decisionLine(row: HistoryRow): string {
  const submitted = `Submitted ${formatDate(row.submitted_at.slice(0, 10))}`
  if (row.status === 'cancelled') {
    const when = row.cancelled_at ? formatDate(row.cancelled_at.slice(0, 10)) : ''
    return when ? `${submitted} · Cancelled by employee on ${when}` : `${submitted} · Cancelled by employee`
  }
  const verb = row.status === 'denied' ? 'Denied' : 'Approved'
  const who = row.reviewer_name || 'Unknown'
  const when = row.reviewed_at ? ` on ${formatDate(row.reviewed_at.slice(0, 10))}` : ''
  return `${submitted} · ${verb} by ${who}${when}`
}

const fieldClass =
  'h-10 box-border px-3 py-0 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDayHours(hours: number): string {
  if (!Number.isFinite(hours)) return ''
  const rounded = Math.round(hours * 100) / 100
  return `${rounded}h`
}

/** Monday-first month grid, including leading and trailing days. Drops a trailing week that sits entirely in the next month. */
function calendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  const lastWeekInNextMonth = days.slice(35).every((day) => day.getMonth() !== month)
  return lastWeekInNextMonth ? days.slice(0, 35) : days
}

export default function PtoReviewClient() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('queue')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [denyId, setDenyId] = useState<string | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [employeeId, setEmployeeId] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [leaveType, setLeaveType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [calendarEmployeeId, setCalendarEmployeeId] = useState('all')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch('/api/pto/queue', { cache: 'no-store', credentials: 'include' })
      if (!res.ok) {
        if (!silent) {
          setError('Could not load requests.')
          setRows([])
        }
        return
      }
      const json = await res.json()
      setRows(Array.isArray(json.requests) ? json.requests : [])
      setError(null)
    } catch {
      if (!silent) {
        setError('Could not load requests.')
        setRows([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    if (!silent) {
      setHistoryLoading(true)
      setHistoryError(null)
    }
    try {
      const res = await fetch('/api/pto/history', { cache: 'no-store', credentials: 'include' })
      if (!res.ok) {
        if (!silent) {
          setHistoryError('Could not load history.')
          setHistory([])
        }
        return
      }
      const json = await res.json()
      setHistory(Array.isArray(json.requests) ? json.requests : [])
      setHistoryError(null)
    } catch {
      if (!silent) {
        setHistoryError('Could not load history.')
        setHistory([])
      }
    } finally {
      if (!silent) setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadHistory()
  }, [load, loadHistory])

  const approve = async (id: string) => {
    setActingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/pto/${id}/approve`, { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not approve.')
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      void loadHistory({ silent: true })
      router.refresh()
    } finally {
      setActingId(null)
    }
  }

  const deny = async (id: string) => {
    const reason = denyReason.trim()
    if (!reason) {
      setError('A reason is required to deny a request.')
      return
    }
    setActingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/pto/${id}/deny`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not deny.')
        return
      }
      setDenyId(null)
      setDenyReason('')
      setRows((prev) => prev.filter((r) => r.id !== id))
      void loadHistory({ silent: true })
      router.refresh()
    } finally {
      setActingId(null)
    }
  }

  const employees = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of history) byId.set(row.user_id, row.employee_name)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [history])

  const leaveTypes = useMemo(() => {
    return [...new Set(history.map((row) => row.leave_type))].sort((a, b) => a.localeCompare(b))
  }, [history])

  const filtered = useMemo(() => {
    return history.filter((row) => {
      if (employeeId !== 'all' && row.user_id !== employeeId) return false
      if (status !== 'all' && row.status !== status) return false
      if (leaveType !== 'all' && row.leave_type !== leaveType) return false
      if (from && row.end_date < from) return false
      if (to && row.start_date > to) return false
      return true
    })
  }, [history, employeeId, status, leaveType, from, to])

  const filtering = filtered.length !== history.length

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-medium ${
      active
        ? 'text-blue-600 border-b-2 border-blue-600'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
    }`

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-semibold border ${
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
    }`

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700" role="tablist" aria-label="PTO requests">
        <button type="button" role="tab" aria-selected={tab === 'queue'} className={tabClass(tab === 'queue')} onClick={() => setTab('queue')}>
          Needs review ({rows.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tabClass(tab === 'history')} onClick={() => setTab('history')}>
          History
        </button>
        <button type="button" role="tab" aria-selected={tab === 'calendar'} className={tabClass(tab === 'calendar')} onClick={() => setTab('calendar')}>
          Calendar
        </button>
      </div>

      {tab === 'queue' ? (
        <QueuePanel
          rows={rows}
          loading={loading}
          error={error}
          actingId={actingId}
          denyId={denyId}
          denyReason={denyReason}
          onDenyReason={setDenyReason}
          onApprove={(id) => void approve(id)}
          onStartDeny={(id) => {
            setDenyId(id)
            setDenyReason('')
          }}
          onDeny={(id) => void deny(id)}
          onCancelDeny={() => {
            setDenyId(null)
            setDenyReason('')
          }}
        />
      ) : tab === 'history' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Employee
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={`mt-1 block ${fieldClass}`}
              >
                <option value="all">All</option>
                {employees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</p>
              <div className="flex h-10 flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Status">
                {(
                  [
                    ['all', 'All'],
                    ['approved', 'Approved'],
                    ['denied', 'Denied'],
                    ['cancelled', 'Cancelled'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={status === value}
                    className={chipClass(status === value)}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className={`mt-1 block ${fieldClass}`}
              >
                <option value="all">All</option>
                {leaveTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`mt-1 block w-[8.75rem] ${fieldClass}`}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={`mt-1 block w-[8.75rem] ${fieldClass}`}
                />
              </label>
            </div>
          </div>

          {historyError && <p className="text-sm text-red-600 dark:text-red-400">{historyError}</p>}
          {historyLoading && history.length === 0 && !historyError && (
            <p className="text-gray-600 dark:text-gray-400">Loading…</p>
          )}
          {filtering && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {filtered.length} of {history.length}
            </p>
          )}
          {!historyLoading && history.length === 0 && !historyError && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-600 dark:text-gray-400">
              No past requests yet.
            </div>
          )}
          {!historyLoading && history.length > 0 && filtered.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-600 dark:text-gray-400">
              No requests match these filters.
            </div>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{r.employee_name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {r.leave_type} · {formatRange(r.start_date, r.end_date)} ·{' '}
                    {totalPtoHours(r.hours_per_day, r.start_date, r.end_date)} hrs ({r.hours_per_day} / day)
                  </p>
                  {r.notes && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.notes}</p>}
                  {r.status === 'denied' && r.denial_reason && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">Reason: {r.denial_reason}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{decisionLine(r)}</p>
                </div>
                <span className={`text-sm font-semibold capitalize shrink-0 ${statusClass(r.status)}`}>
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CalendarPanel
          pending={rows}
          history={history}
          loading={loading || historyLoading}
          error={historyError}
          employeeId={calendarEmployeeId}
          onEmployeeId={setCalendarEmployeeId}
          month={calendarMonth}
          onMonth={setCalendarMonth}
        />
      )}
    </div>
  )
}

type CalendarEntry = {
  id: string
  user_id: string
  employee_name: string
  leave_type: string
  hours_per_day: number
  start_date: string
  end_date: string
  status: 'approved' | 'pending'
}

function CalendarPanel({
  pending,
  history,
  loading,
  error,
  employeeId,
  onEmployeeId,
  month,
  onMonth,
}: {
  pending: QueueRow[]
  history: HistoryRow[]
  loading: boolean
  error: string | null
  employeeId: string
  onEmployeeId: (id: string) => void
  month: Date
  onMonth: (month: Date) => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const days = useMemo(() => calendarDays(year, monthIndex), [year, monthIndex])
  const todayKey = toDateKey(new Date())

  const entries = useMemo(() => {
    const approved: CalendarEntry[] = history
      .filter((row) => row.status === 'approved')
      .map((row) => ({
        id: row.id,
        user_id: row.user_id,
        employee_name: row.employee_name,
        leave_type: row.leave_type,
        hours_per_day: row.hours_per_day,
        start_date: row.start_date,
        end_date: row.end_date,
        status: 'approved',
      }))
    const waiting: CalendarEntry[] = pending.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      employee_name: row.employee_name,
      leave_type: row.leave_type,
      hours_per_day: row.hours_per_day,
      start_date: row.start_date,
      end_date: row.end_date,
      status: 'pending',
    }))
    return [...approved, ...waiting]
  }, [history, pending])

  const employees = useMemo(() => {
    const byId = new Map<string, string>()
    for (const entry of entries) byId.set(entry.user_id, entry.employee_name)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [entries])

  const visible = employeeId === 'all' ? entries : entries.filter((entry) => entry.user_id === employeeId)
  const title = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => onMonth(new Date(year, monthIndex - 1, 1))}
              className="h-10 w-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ‹
            </button>
            <h2 className="min-w-[11rem] text-center text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => onMonth(new Date(year, monthIndex + 1, 1))}
              className="h-10 w-10 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ›
            </button>
          </div>
          <p className="mt-2 flex gap-4 text-sm font-semibold">
            <span className="text-green-700 dark:text-green-400">Approved</span>
            <span className="text-amber-700 dark:text-amber-400">Pending</span>
          </p>
        </div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Employee
          <select
            value={employeeId}
            onChange={(e) => onEmployeeId(e.target.value)}
            className={`mt-1 block ${fieldClass}`}
          >
            <option value="all">All</option>
            {employees.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && visible.length === 0 && !error && (
        <p className="text-gray-600 dark:text-gray-400">Loading…</p>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {WEEKDAYS.map((label, index) => (
            <div
              key={label}
              className={`bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 ${
                index === 0 ? '' : 'border-l border-gray-200 dark:border-gray-700'
              }`}
            >
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = toDateKey(day)
            const inMonth = day.getMonth() === monthIndex
            const onDay = visible
              .filter((entry) => entry.start_date <= key && entry.end_date >= key)
              .sort((a, b) => a.employee_name.localeCompare(b.employee_name) || a.leave_type.localeCompare(b.leave_type))
            return (
              <div
                key={key}
                className={`min-h-[6.5rem] border-t border-gray-200 dark:border-gray-700 p-1.5 ${
                  inMonth ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/60'
                } ${day.getDay() === 1 ? '' : 'border-l border-gray-200 dark:border-gray-700'}`}
              >
                <p
                  className={`text-xs font-medium ${
                    key === todayKey
                      ? 'text-blue-600 dark:text-blue-400'
                      : inMonth
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {day.getDate()}
                </p>
                <div className="mt-1 space-y-1.5">
                  {onDay.map((entry) => (
                    <p
                      key={entry.id}
                      className={`text-[11px] leading-snug break-words ${
                        entry.status === 'approved'
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <span className="font-semibold">{entry.employee_name}</span>
                      <br />
                      {entry.leave_type} · {formatDayHours(entry.hours_per_day)}
                    </p>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function QueuePanel({
  rows,
  loading,
  error,
  actingId,
  denyId,
  denyReason,
  onDenyReason,
  onApprove,
  onStartDeny,
  onDeny,
  onCancelDeny,
}: {
  rows: QueueRow[]
  loading: boolean
  error: string | null
  actingId: string | null
  denyId: string | null
  denyReason: string
  onDenyReason: (value: string) => void
  onApprove: (id: string) => void
  onStartDeny: (id: string) => void
  onDeny: (id: string) => void
  onCancelDeny: () => void
}) {
  if (loading && rows.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">Loading…</p>
  }

  if (error && rows.length === 0) {
    return <p className="text-red-600 dark:text-red-400">{error}</p>
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-600 dark:text-gray-400">
        No PTO requests waiting for review.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {rows.map((r) => (
        <div key={r.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{r.employee_name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {r.leave_type} · {formatRange(r.start_date, r.end_date)} ·{' '}
                {totalPtoHours(r.hours_per_day, r.start_date, r.end_date)} hrs ({r.hours_per_day} / day)
              </p>
              {r.notes && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.notes}</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Submitted {formatDate(r.submitted_at.slice(0, 10))}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onApprove(r.id)}
                disabled={actingId === r.id}
                className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {actingId === r.id && denyId !== r.id ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => onStartDeny(r.id)}
                disabled={actingId === r.id}
                className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
          {denyId === r.id && (
            <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor={`deny-${r.id}`}>
                Reason
              </label>
              <textarea
                id={`deny-${r.id}`}
                rows={3}
                required
                value={denyReason}
                onChange={(e) => onDenyReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDeny(r.id)}
                  disabled={actingId === r.id}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {actingId === r.id ? 'Denying…' : 'Confirm deny'}
                </button>
                <button
                  type="button"
                  onClick={onCancelDeny}
                  className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm font-semibold"
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
