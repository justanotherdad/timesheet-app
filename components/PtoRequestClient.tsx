'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  PTO_LEAVE_TYPE_OPTIONS,
  PTO_MAX_HOURS_PER_DAY,
  PTO_MIN_HOURS_PER_DAY,
  PTO_OTHER_LEAVE_TYPE,
  inclusiveDayCount,
  isYmd,
  totalPtoHours,
} from '@/lib/pto-shared'
import { formatDate } from '@/lib/utils'
import type { PtoRequest } from '@/types/database'

function statusClass(status: string): string {
  if (status === 'approved') return 'text-green-700 dark:text-green-400'
  if (status === 'denied') return 'text-red-600 dark:text-red-400'
  if (status === 'cancelled') return 'text-gray-500 dark:text-gray-400'
  return 'text-amber-700 dark:text-amber-400'
}

function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

export default function PtoRequestClient() {
  const [leaveType, setLeaveType] = useState<string>(PTO_LEAVE_TYPE_OPTIONS[0])
  const [customLeaveType, setCustomLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formOk, setFormOk] = useState<string | null>(null)

  const [rows, setRows] = useState<PtoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch('/api/pto', { cache: 'no-store', credentials: 'include' })
      if (!res.ok) {
        setListError('Could not load your requests.')
        setRows([])
        return
      }
      const json = await res.json()
      setRows(Array.isArray(json.requests) ? json.requests : [])
    } catch {
      setListError('Could not load your requests.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const preview = useMemo(() => {
    const hours = Number(hoursPerDay)
    if (!isYmd(startDate) || !isYmd(endDate) || endDate < startDate || !Number.isFinite(hours)) {
      return null
    }
    const days = inclusiveDayCount(startDate, endDate)
    return { days, total: totalPtoHours(hours, startDate, endDate) }
  }, [startDate, endDate, hoursPerDay])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFormOk(null)
    try {
      const res = await fetch('/api/pto', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveType,
          customLeaveType,
          startDate,
          endDate,
          hoursPerDay,
          notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError((json as { error?: string }).error || 'Could not submit request.')
        return
      }
      setFormOk('Request submitted.')
      setNotes('')
      setCustomLeaveType('')
      await load()
    } catch {
      setFormError('Could not submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this pending request?')) return
    setCancellingId(id)
    setListError(null)
    try {
      const res = await fetch(`/api/pto/${id}/cancel`, { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError((json as { error?: string }).error || 'Could not cancel.')
        return
      }
      await load()
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New request</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Approval is permission to take the time. After it is approved, still enter the hours on
          that week’s timesheet PTO row so payroll can export them.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-type">
            Type
          </label>
          <select
            id="pto-type"
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
          >
            {PTO_LEAVE_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value={PTO_OTHER_LEAVE_TYPE}>{PTO_OTHER_LEAVE_TYPE}</option>
          </select>
        </div>
        {leaveType === PTO_OTHER_LEAVE_TYPE && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-custom-type">
              Other type
            </label>
            <input
              id="pto-custom-type"
              type="text"
              value={customLeaveType}
              onChange={(e) => setCustomLeaveType(e.target.value)}
              required
              maxLength={80}
              placeholder="Type the leave type"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400"
            />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-start">
              Start
            </label>
            <input
              id="pto-start"
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-end">
              End
            </label>
            <input
              id="pto-end"
              type="date"
              required
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-hours">
            Hours per day
          </label>
          <input
            id="pto-hours"
            type="number"
            required
            min={PTO_MIN_HOURS_PER_DAY}
            max={PTO_MAX_HOURS_PER_DAY}
            step={0.25}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Maximum {PTO_MAX_HOURS_PER_DAY} hours per day, including weekend dates in the range.
            {preview ? ` Total ${preview.total} hours across ${preview.days} day${preview.days === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="pto-notes">
            Notes (optional)
          </label>
          <textarea
            id="pto-notes"
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
          />
        </div>
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {formOk && <p className="text-sm text-green-700 dark:text-green-400">{formOk}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">My requests</h2>
        {loading && rows.length === 0 && (
          <p className="text-gray-600 dark:text-gray-400">Loading…</p>
        )}
        {listError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{listError}</p>}
        {!loading && rows.length === 0 && !listError && (
          <p className="text-gray-600 dark:text-gray-400">No requests yet.</p>
        )}
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{r.leave_type}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatRange(r.start_date, r.end_date)} · {totalPtoHours(r.hours_per_day, r.start_date, r.end_date)} hrs
                  </p>
                </div>
                <span className={`text-sm font-semibold capitalize ${statusClass(r.status)}`}>
                  {r.status}
                </span>
              </div>
              {r.status === 'denied' && r.denial_reason && (
                <p className="text-sm text-red-600 dark:text-red-400">Reason: {r.denial_reason}</p>
              )}
              {r.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => void cancel(r.id)}
                  disabled={cancellingId === r.id}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  {cancellingId === r.id ? 'Cancelling…' : 'Cancel request'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
