'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { totalPtoHours } from '@/lib/pto-shared'
import type { PtoRequest, PtoRequestStatus } from '@/types/database'

type QueueRow = PtoRequest & { employee_name: string }
type HistoryRow = QueueRow & { reviewer_name: string | null }
type Tab = 'queue' | 'history'
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
  'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'

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
      ) : (
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
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
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
      )}
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
