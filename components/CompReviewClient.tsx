'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  compKindLabel,
  formatHours,
  type CompAuditRow,
  type CompHistoryRow,
  type CompQueueRow,
} from '@/lib/comp-shared'
import { formatDate, formatDateForInput, getPreviousWeekEnding, getWeekEndingSundayOptions } from '@/lib/utils'

type Person = { id: string; name: string }

function statusClass(status: string): string {
  if (status === 'approved') return 'text-green-700 dark:text-green-400'
  if (status === 'denied') return 'text-red-600 dark:text-red-400'
  if (status === 'cancelled') return 'text-gray-500 dark:text-gray-400'
  return 'text-amber-700 dark:text-amber-400'
}

function decidedBy(row: CompHistoryRow): string {
  if (row.kind === 'admin_add') return '—'
  if (row.status === 'approved' || row.status === 'denied') return row.reviewer_name || '—'
  if (row.status === 'cancelled') return row.cancelled_by_name || '—'
  return '—'
}

function cancelDoes(row: CompHistoryRow): string {
  if (row.status === 'approved' && (row.kind === 'bank' || row.kind === 'admin_add')) {
    return `Removes ${formatHours(row.hours)}`
  }
  if (row.status === 'approved' && row.kind === 'use') return `Returns ${formatHours(row.hours)}`
  return 'Cancels the request'
}

export default function CompReviewClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const weekOptions = useMemo(() => getWeekEndingSundayOptions(), [])
  const [queue, setQueue] = useState<CompQueueRow[]>([])
  const [history, setHistory] = useState<CompHistoryRow[]>([])
  const [audit, setAudit] = useState<CompAuditRow[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popup, setPopup] = useState<{ id: string; mode: 'approve' | 'deny' } | null>(null)
  const [note, setNote] = useState('')
  const [popupError, setPopupError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [personId, setPersonId] = useState('')
  const [addWeek, setAddWeek] = useState(() => formatDateForInput(getPreviousWeekEnding()))
  const [addHours, setAddHours] = useState('4')
  const [addError, setAddError] = useState<string | null>(null)
  const [addOk, setAddOk] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [employeeId, setEmployeeId] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/comp/review', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not load comp requests.')
        return
      }
      setQueue(Array.isArray(json.queue) ? json.queue : [])
      setHistory(Array.isArray(json.history) ? json.history : [])
      setAudit(Array.isArray(json.audit) ? json.audit : [])
      const nextPeople = Array.isArray(json.people) ? json.people : []
      setPeople(nextPeople)
      setPersonId((current) => current || nextPeople[0]?.id || '')
      router.refresh()
    } catch {
      setError('Could not load comp requests.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const years = useMemo(() => {
    const found = new Set(history.map((row) => row.week_ending.slice(0, 4)))
    found.add(String(new Date().getFullYear()))
    return [...found].sort((a, b) => b.localeCompare(a))
  }, [history])

  const employees = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of history) byId.set(row.user_id, row.employee_name)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [history])

  const filteredHistory = history.filter((row) => {
    if (row.week_ending.slice(0, 4) !== year) return false
    if (employeeId !== 'all' && row.user_id !== employeeId) return false
    return true
  })
  const filteredAudit = audit.filter((row) => {
    if (row.week_ending.slice(0, 4) !== year) return false
    if (employeeId !== 'all' && row.user_id !== employeeId) return false
    return true
  })

  const openPopup = (id: string, mode: 'approve' | 'deny') => {
    setPopup({ id, mode })
    setNote('')
    setPopupError(null)
  }

  const confirm = async () => {
    if (!popup) return
    setActing(true)
    setPopupError(null)
    try {
      const res = await fetch(`/api/comp/${popup.id}/${popup.mode === 'approve' ? 'approve' : 'deny'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPopupError((json as { error?: string }).error || 'Could not save the decision.')
        return
      }
      setPopup(null)
      await load()
    } catch {
      setPopupError('Could not save the decision.')
    } finally {
      setActing(false)
    }
  }

  const cancelEntry = async (row: CompHistoryRow) => {
    const message =
      row.status === 'approved' && (row.kind === 'bank' || row.kind === 'admin_add')
        ? `Remove ${formatHours(row.hours)} hours from ${row.employee_name}'s bank?`
        : row.status === 'approved'
          ? `Cancel this Use and return ${formatHours(row.hours)} hours to the bank?`
          : 'Cancel this pending request?'
    if (!window.confirm(message)) return
    setError(null)
    const res = await fetch(`/api/comp/${row.id}/cancel`, { method: 'POST', credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError((json as { error?: string }).error || 'Could not cancel.')
      return
    }
    await load()
  }

  const addHoursToBank = async () => {
    setAdding(true)
    setAddError(null)
    setAddOk(null)
    try {
      const res = await fetch('/api/comp/admin-add', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: personId, weekEnding: addWeek, hours: addHours }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddError((json as { error?: string }).error || 'Could not add hours.')
        return
      }
      setAddOk('Hours added to the bank.')
      await load()
    } catch {
      setAddError('Could not add hours.')
    } finally {
      setAdding(false)
    }
  }

  const popupRow = popup ? queue.find((row) => row.id === popup.id) : null
  const cancellable = history.filter((row) => row.status === 'pending' || row.status === 'approved')
  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'

  return (
    <div className="space-y-8 max-w-6xl">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Waiting for review</h2>
        {loading && queue.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No comp requests waiting.</p>
        ) : (
          <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500 dark:text-gray-400">
                <tr>
                  {['Employee', 'Request', 'Week ending', 'Hours', 'Check now', 'Decision'].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.employee_name}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{compKindLabel(row.kind)} Comp</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{formatDate(row.week_ending)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.hours)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{row.check_now}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!row.can_approve}
                          title={row.block_reason || undefined}
                          onClick={() => openPopup(row.id, 'approve')}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openPopup(row.id, 'deny')}
                          className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-700"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={`grid grid-cols-1 gap-6 items-start ${isAdmin ? 'lg:grid-cols-5' : ''}`}>
        {isAdmin && (
          <section className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add banked hours</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Posts straight into that person’s tally. The billable-hours limit does not apply here.
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="comp-add-person">
              Person
              <select id="comp-add-person" className={`mt-1 ${fieldClass}`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="comp-add-week">
              Week ending
              <select id="comp-add-week" className={`mt-1 ${fieldClass}`} value={addWeek} onChange={(e) => setAddWeek(e.target.value)}>
                {weekOptions.map((week) => (
                  <option key={week} value={week}>{formatDate(week)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="comp-add-hours">
              Hours
              <input id="comp-add-hours" type="number" min={0.25} step={0.25} className={`mt-1 ${fieldClass}`} value={addHours} onChange={(e) => setAddHours(e.target.value)} />
            </label>
            {addError && <p className="text-sm text-red-600 dark:text-red-400">{addError}</p>}
            {addOk && <p className="text-sm text-green-700 dark:text-green-400">{addOk}</p>}
            <button
              type="button"
              disabled={adding || !personId}
              onClick={() => void addHoursToBank()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add to bank'}
            </button>
          </section>
        )}
        <section className={`${isAdmin ? 'lg:col-span-3' : ''} bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-3`}>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cancel a comp entry</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Any named comp reviewer, and any admin. The employee does not see these actions.
          </p>
          {cancellable.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Nothing to cancel.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    {['Employee', 'Entry', 'Week ending', 'Hours', 'Cancel does', ''].map((label) => (
                      <th key={label || 'action'} className="px-2 py-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cancellable.map((row) => (
                    <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-2 py-2">{row.employee_name}</td>
                      <td className="px-2 py-2">{compKindLabel(row.kind)}</td>
                      <td className="px-2 py-2">{formatDate(row.week_ending)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatHours(row.hours)}</td>
                      <td className="px-2 py-2">{cancelDoes(row)}</td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => void cancelEntry(row)} className="text-red-600 dark:text-red-400 hover:underline">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">History of all comp requests</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Year
            <select className={`mt-1 ${fieldClass}`} value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Employee
            <select className={`mt-1 ${fieldClass}`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="all">All</option>
              {employees.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No comp requests for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500 dark:text-gray-400">
                <tr>
                  {['Employee', 'Request', 'Week ending', 'Hours', 'Status', 'Approved / denied by', 'Response'].map((label) => (
                    <th key={label} className="px-2 py-2 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-2 py-2">{row.employee_name}</td>
                    <td className="px-2 py-2">{compKindLabel(row.kind)}</td>
                    <td className="px-2 py-2">{formatDate(row.week_ending)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatHours(row.hours)}</td>
                    <td className={`px-2 py-2 capitalize ${statusClass(row.status)}`}>{row.kind === 'admin_add' && row.status === 'approved' ? 'In bank' : row.status}</td>
                    <td className="px-2 py-2">{decidedBy(row)}</td>
                    <td className="px-2 py-2">{row.reviewer_note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Audit trail</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Approved, Denied, Added, Removed, and Cancelled. A deleted request is recorded as Cancelled. Submitted requests are left out.
          </p>
          {filteredAudit.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No audit entries for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    {['When', 'Decision', 'Who', 'What'].map((label) => (
                      <th key={label} className="px-2 py-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((row) => (
                    <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(row.created_at.slice(0, 10))}</td>
                      <td className="px-2 py-2 capitalize">{row.decision}</td>
                      <td className="px-2 py-2">{row.actor_name}</td>
                      <td className="px-2 py-2">
                        {compKindLabel(row.kind)} {formatHours(row.hours)}, week ending {formatDate(row.week_ending)}
                        {row.employee_name ? ` · ${row.employee_name}` : ''}
                        {row.response ? `. Response: ${row.response}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {popup && popupRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {popup.mode === 'approve' ? 'Approve' : 'Deny'} {popupRow.employee_name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {compKindLabel(popupRow.kind)} Comp · week ending {formatDate(popupRow.week_ending)} · {formatHours(popupRow.hours)} hrs
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="comp-response">
              {popup.mode === 'approve' ? 'Note (optional)' : 'Note'}
              <textarea
                id="comp-response"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={popup.mode === 'approve' ? 'Optional note' : 'Why this is denied'}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">The employee sees this response on the request.</p>
            {popupError && <p className="text-sm text-red-600 dark:text-red-400">{popupError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={acting || (popup.mode === 'deny' && note.trim().length === 0)}
                onClick={() => void confirm()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {acting ? 'Saving…' : popup.mode === 'approve' ? 'Confirm approve' : 'Confirm deny'}
              </button>
              <button type="button" onClick={() => setPopup(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                Never mind
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
