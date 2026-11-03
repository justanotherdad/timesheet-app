'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import {
  COMP_TIME_LEAVE_TYPE,
  DEFAULT_PTO_CLIENT_ACK_INFO,
  DEFAULT_PTO_CLIENT_ACK_LABEL,
  PTO_LEAVE_TYPE_OPTIONS,
  PTO_MAX_HOURS_PER_DAY,
  PTO_MIN_HOURS_PER_DAY,
  PTO_OTHER_LEAVE_TYPE,
  inclusiveDayCount,
  isYmd,
  ptoClientAckInfo,
  ptoClientAckLabel,
  ptoReviewerNote,
  totalPtoHours,
} from '@/lib/pto-shared'
import {
  bankRequestError,
  compKindLabel,
  formatHours,
  parseCompHours,
  requestUseError,
  type CompPreview,
  type CompRequest,
} from '@/lib/comp-shared'
import { formatDate, formatDateForInput, getPreviousWeekEnding, getWeekEndingSundayOptions } from '@/lib/utils'
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
  const router = useRouter()
  const clearedBadge = useRef(false)
  const weekOptions = useMemo(() => getWeekEndingSundayOptions(), [])
  const [leaveType, setLeaveType] = useState<string>(PTO_LEAVE_TYPE_OPTIONS[0])
  const [compKind, setCompKind] = useState<'bank' | 'use'>('bank')
  const [weekEnding, setWeekEnding] = useState(() => formatDateForInput(getPreviousWeekEnding()))
  const [compHours, setCompHours] = useState('8')
  const [compPreview, setCompPreview] = useState<{ weekEnding: string; data: CompPreview | null } | null>(null)
  const [customLeaveType, setCustomLeaveType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [clientAcknowledged, setClientAcknowledged] = useState(false)
  const [ackLabel, setAckLabel] = useState(DEFAULT_PTO_CLIENT_ACK_LABEL)
  const [ackInfo, setAckInfo] = useState(DEFAULT_PTO_CLIENT_ACK_INFO)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formOk, setFormOk] = useState<string | null>(null)

  const [rows, setRows] = useState<PtoRequest[]>([])
  const [compRows, setCompRows] = useState<CompRequest[]>([])
  const [tally, setTally] = useState({ banked: 0, held: 0, available: 0 })
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const [ptoRes, compRes] = await Promise.all([
        fetch('/api/pto', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/comp', { cache: 'no-store', credentials: 'include' }),
      ])
      if (!ptoRes.ok) {
        setListError('Could not load your requests.')
        setRows([])
        return
      }
      const json = await ptoRes.json()
      setRows(Array.isArray(json.requests) ? json.requests : [])
      let unseen = Number((json as { unseenDecisions?: unknown }).unseenDecisions)
      if (compRes.ok) {
        const compJson = await compRes.json()
        setCompRows(Array.isArray(compJson.requests) ? compJson.requests : [])
        setTally({
          banked: Number(compJson.banked) || 0,
          held: Number(compJson.held) || 0,
          available: Number(compJson.available) || 0,
        })
        const compUnseen = Number(compJson.unseenDecisions)
        if (Number.isFinite(compUnseen)) unseen += compUnseen
      } else {
        const compJson = await compRes.json().catch(() => ({}))
        setListError((compJson as { error?: string }).error || 'Could not load comp time.')
      }
      if (!clearedBadge.current && Number.isFinite(unseen) && unseen > 0) {
        clearedBadge.current = true
        router.refresh()
      }
    } catch {
      setListError('Could not load your requests.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    fetch('/api/company-settings', { cache: 'no-store', credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, unknown>) => {
        setAckLabel(ptoClientAckLabel(data || {}))
        setAckInfo(ptoClientAckInfo(data || {}))
      })
      .catch(() => {})
  }, [])

  const isComp = leaveType === COMP_TIME_LEAVE_TYPE

  useEffect(() => {
    if (!isComp || !weekEnding) return
    const requestedWeek = weekEnding
    let cancelled = false
    fetch(`/api/comp/preview?weekEnding=${encodeURIComponent(requestedWeek)}`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as CompPreview
      })
      .then((data) => {
        if (!cancelled) setCompPreview({ weekEnding: requestedWeek, data })
      })
      .catch(() => {
        if (!cancelled) setCompPreview({ weekEnding: requestedWeek, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [isComp, weekEnding, compRows])

  const dayPreview = useMemo(() => {
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
      const res = await fetch(isComp ? '/api/comp' : '/api/pto', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isComp
            ? { kind: compKind, weekEnding, hours: compHours, clientAcknowledged: compKind === 'use' && clientAcknowledged }
            : { leaveType, customLeaveType, startDate, endDate, hoursPerDay, clientAcknowledged }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError((json as { error?: string }).error || 'Could not submit request.')
        return
      }
      setFormOk('Request submitted.')
      setClientAcknowledged(false)
      setCustomLeaveType('')
      await load()
    } catch {
      setFormError('Could not submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async (id: string, status: string) => {
    const message =
      status === 'approved' ? 'Cancel this approved request?' : 'Cancel this pending request?'
    if (!window.confirm(message)) return
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

  const compHoursNumber = parseCompHours(compHours)
  const weekPreview = compPreview?.weekEnding === weekEnding ? compPreview.data : null
  const compBlock = !isComp
    ? null
    : compHoursNumber == null
      ? 'Enter hours greater than 0.'
      : compPreview?.weekEnding !== weekEnding
        ? 'Checking this week…'
        : !weekPreview
          ? 'Could not check this week. Try again.'
          : compKind === 'use'
            ? requestUseError(compHoursNumber, weekPreview.available)
            : bankRequestError({
                submitted: weekPreview.submitted,
                hasTimesheet: weekPreview.hasTimesheet,
                billable: weekPreview.billable,
                threshold: weekPreview.threshold,
                alreadyHours: weekPreview.alreadyHours,
                requestHours: compHoursNumber,
              })

  const listItems = [
    ...rows.map((row) => ({ source: 'pto' as const, at: row.submitted_at, row })),
    ...compRows.map((row) => ({ source: 'comp' as const, at: row.submitted_at, row })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New request</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Approval is permission to take the time. After leave or Use Comp is approved, still enter
          the hours on that week’s timesheet. Bank Comp is not entered on the timesheet.
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
        {isComp && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="comp-kind">
              Comp time
            </label>
            <select
              id="comp-kind"
              value={compKind}
              onChange={(e) => setCompKind(e.target.value === 'use' ? 'use' : 'bank')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            >
              <option value="bank">Bank Comp</option>
              <option value="use">Use Comp</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {compKind === 'bank'
                ? 'Added to the bank only after approval. These hours are not entered on the timesheet.'
                : 'Removed from the bank only after approval. Then enter the same hours on that week’s timesheet.'}
            </p>
          </div>
        )}
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
        {isComp ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="comp-week">
                Week ending
              </label>
              <select
                id="comp-week"
                required
                value={weekEnding}
                onChange={(e) => setWeekEnding(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              >
                {weekOptions.map((week) => (
                  <option key={week} value={week}>
                    {formatDate(week)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sundays only, same as timesheets.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="comp-hours">
                Hours
              </label>
              <input
                id="comp-hours"
                type="number"
                required
                min={0.25}
                step={0.25}
                value={compHours}
                onChange={(e) => setCompHours(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              />
              {weekPreview && compKind === 'bank' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {weekPreview.submitted
                    ? `Submitted billable ${formatHours(weekPreview.billable)}. Unbillable ${formatHours(weekPreview.unbillable)} is ignored. ${formatHours(weekPreview.alreadyHours)} is already approved or pending, so ${formatHours(weekPreview.remaining)} is left.`
                    : weekPreview.hasTimesheet
                      ? `This week’s timesheet is still a draft (${formatHours(weekPreview.billable)} billable). Bank Comp stays blocked until it is submitted.`
                      : 'There is no timesheet for this week ending yet.'}
                </p>
              )}
              {weekPreview && compKind === 'use' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {`Banked ${formatHours(weekPreview.banked)}. ${formatHours(weekPreview.held)} pending Use hours are held, so ${formatHours(weekPreview.available)} can be requested.`}
                </p>
              )}
            </div>
          </>
        ) : (
        <>
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
            {dayPreview ? ` Total ${dayPreview.total} hours across ${dayPreview.days} day${dayPreview.days === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
        </>
        )}
        {(!isComp || compKind === 'use') && (
          <ClientAckField
            label={ackLabel}
            info={ackInfo}
            checked={clientAcknowledged}
            onChange={setClientAcknowledged}
          />
        )}
        {compBlock && <p className="text-sm text-red-600 dark:text-red-400">{compBlock}</p>}
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {formOk && <p className="text-sm text-green-700 dark:text-green-400">{formOk}</p>}
        <button
          type="submit"
          disabled={submitting || Boolean(compBlock)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">My requests</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Comp time banked {formatHours(tally.banked)} hrs. {formatHours(tally.held)} pending Use hrs are held, so {formatHours(tally.available)} can be requested. Pending banks are not in the total.
        </p>
        {loading && listItems.length === 0 && (
          <p className="text-gray-600 dark:text-gray-400">Loading…</p>
        )}
        {listError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{listError}</p>}
        {!loading && listItems.length === 0 && !listError && (
          <p className="text-gray-600 dark:text-gray-400">No requests yet.</p>
        )}
        <div className="space-y-3">
          {listItems.map((item) => item.source === 'comp' ? (
            <div
              key={`comp-${item.row.id}`}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {item.row.kind === 'admin_add' ? 'Admin add' : `Comp Time · ${compKindLabel(item.row.kind)}`}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Week ending {formatDate(item.row.week_ending)} · {formatHours(item.row.hours)} hrs
                  </p>
                </div>
                <span className={`text-sm font-semibold capitalize ${statusClass(item.row.status)}`}>
                  {item.row.kind === 'admin_add' && item.row.status === 'approved' ? 'In bank' : item.row.status}
                  {item.row.kind === 'use' && item.row.status === 'pending' ? ' · held' : ''}
                </span>
              </div>
              {item.row.kind === 'use' && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {ackLabel}: {item.row.client_acknowledged ? 'Yes' : 'No'}
                </p>
              )}
              {item.row.reviewer_note && (item.row.status === 'approved' || item.row.status === 'denied') && (
                <p className={`text-sm ${item.row.status === 'denied' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  Response: {item.row.reviewer_note}
                </p>
              )}
            </div>
          ) : (
            <div
              key={item.row.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.row.leave_type}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatRange(item.row.start_date, item.row.end_date)} · {totalPtoHours(item.row.hours_per_day, item.row.start_date, item.row.end_date)} hrs
                  </p>
                </div>
                <span className={`text-sm font-semibold capitalize ${statusClass(item.row.status)}`}>
                  {item.row.status}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {ackLabel}: {item.row.client_acknowledged ? 'Yes' : 'No'}
              </p>
              {ptoReviewerNote(item.row) && (item.row.status === 'approved' || item.row.status === 'denied') && (
                <p
                  className={`text-sm ${
                    item.row.status === 'denied'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Reviewer note: {ptoReviewerNote(item.row)}
                </p>
              )}
              {(item.row.status === 'pending' || item.row.status === 'approved') && (
                <button
                  type="button"
                  onClick={() => void cancel(item.row.id, item.row.status)}
                  disabled={cancellingId === item.row.id}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  {cancellingId === item.row.id ? 'Cancelling…' : 'Cancel request'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClientAckField({
  label,
  info,
  checked,
  onChange,
}: {
  label: string
  info: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const openPopup = useCallback(() => {
    setOpen(true)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setOpen(false)
      timerRef.current = null
    }, 2000)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open, close])

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  return (
    <div className="flex items-center gap-2">
      <input
        id="pto-client-ack"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 dark:border-gray-600"
      />
      <label htmlFor="pto-client-ack" className="text-sm text-gray-900 dark:text-gray-100">
        {label}
      </label>
      <span className="relative inline-flex">
        <button
          ref={buttonRef}
          type="button"
          aria-label={`About ${label}`}
          aria-expanded={open}
          onClick={() => (open ? close() : openPopup())}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-400 text-gray-600 hover:text-gray-900 dark:border-gray-500 dark:text-gray-300 dark:hover:text-gray-100"
        >
          <Info className="h-3 w-3" aria-hidden />
        </button>
        {open && (
          <div
            ref={popupRef}
            role="tooltip"
            className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {info}
            <span
              aria-hidden
              className="absolute -bottom-1.5 left-2 h-3 w-3 rotate-45 border-b border-r border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900"
            />
          </div>
        )}
      </span>
    </div>
  )
}
