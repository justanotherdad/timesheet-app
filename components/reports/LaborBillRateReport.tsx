'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import MultiSelectDropdown from '@/components/admin/MultiSelectDropdown'
import {
  buildStatement,
  formatDay,
  hoursLabel,
  marginLabel,
  money,
  type LaborWeek,
  type PayKind,
  type PayRateRow,
  type StatementLine,
} from '@/lib/labor-profit-math'

type EmployeeOption = { id: string; name: string; employeeType: 'internal' | 'external' }
type ClientOption = { id: string; name: string }
type PoOption = { id: string; poNumber: string; projectName: string; clientId: string; clientName: string }
type SavedItem = { id: string; title: string; createdAt: string; createdByName: string | null; expiresAt: string }
type AccessMember = { userId: string; name: string; isOwner: boolean }
type TimeKind = 'all' | 'months' | 'range'

type Snapshot = {
  kind: 'labor_profit'
  generatedAt: string
  generatedByName: string
  periodLabel: string
  filterLabel: string
  weeks: LaborWeek[]
}

function monthChoices() {
  const out: { id: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ id, label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) })
  }
  return out
}

function dayBefore(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() - 1)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

function poLabel(line: StatementLine): string {
  return line.projectName ? `${line.poNumber} · ${line.projectName}` : line.poNumber
}

function billLabel(line: StatementLine, lines: StatementLine[]): string {
  const split = lines.filter((l) => l.clientName === line.clientName && l.poNumber === line.poNumber).length > 1
  const rate = money(line.billRate)
  if (!split) return rate
  const span = line.weekFrom === line.weekTo ? formatDay(line.weekFrom) : `${formatDay(line.weekFrom)} – ${formatDay(line.weekTo)}`
  return `${rate}  ${span}`
}

const controlClass =
  'mt-1 box-border h-10 w-full px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'
const dropdownClass = 'h-10 box-border'

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export default function LaborBillRateReport({
  isOwner,
  pathSegment,
  viewerName,
}: {
  isOwner: boolean
  pathSegment: string
  viewerName: string
}) {
  const months = useMemo(monthChoices, [])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [rates, setRates] = useState<PayRateRow[]>([])
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [segment, setSegment] = useState(pathSegment)
  const [members, setMembers] = useState<AccessMember[]>([])
  const [candidates, setCandidates] = useState<{ userId: string; name: string }[]>([])
  const [grantId, setGrantId] = useState('')
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessBusy, setAccessBusy] = useState(false)

  const [employeeType, setEmployeeType] = useState<'all' | 'internal' | 'external'>('all')
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [clientIds, setClientIds] = useState<string[]>([])
  const [poIds, setPoIds] = useState<string[]>([])
  const [timeKind, setTimeKind] = useState<TimeKind | ''>('')
  const [monthIds, setMonthIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [weeks, setWeeks] = useState<LaborWeek[] | null>(null)
  const [periodLabel, setPeriodLabel] = useState('')
  const [filterLabel, setFilterLabel] = useState('')
  const [ranAt, setRanAt] = useState<string | null>(null)
  const [ranBy, setRanBy] = useState(viewerName)
  const [reportTitle, setReportTitle] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [addUserId, setAddUserId] = useState('')
  const [addKind, setAddKind] = useState<PayKind>('w2')
  const [addAmount, setAddAmount] = useState('')
  const [addFrom, setAddFrom] = useState('')
  const [addTo, setAddTo] = useState('')
  const [addCurrent, setAddCurrent] = useState(true)
  const [closeOn, setCloseOn] = useState('')
  const [rateError, setRateError] = useState<string | null>(null)
  const [rateBusy, setRateBusy] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const address = `${origin}/dashboard/${pathSegment}`

  const loadRates = useCallback(async () => {
    const res = await fetch('/api/reports/labor-profit/pay-rates', { cache: 'no-store' })
    if (!res.ok) throw new Error('Pay rates could not be loaded.')
    const data = await res.json()
    setRates(data.rates || [])
  }, [])

  const loadSaved = useCallback(async () => {
    const res = await fetch('/api/reports/labor-profit', { cache: 'no-store' })
    if (!res.ok) throw new Error('Saved reports could not be loaded.')
    const data = await res.json()
    setSaved(data.reports || [])
  }, [])

  const loadAccess = useCallback(async () => {
    if (!isOwner) return
    const res = await fetch('/api/reports/labor-profit/access', { cache: 'no-store' })
    if (!res.ok) throw new Error('Access could not be loaded.')
    const data = await res.json()
    setMembers(data.members || [])
    setCandidates(data.superAdmins || [])
    if (data.pathSegment) setSegment(data.pathSegment)
  }, [isOwner])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reports/labor-bill-rate/options', { cache: 'no-store' })
        if (!res.ok) throw new Error('Filters could not be loaded.')
        const data = await res.json()
        if (cancelled) return
        setClients(data.clients || [])
        setPos(data.pos || [])
        setEmployees(data.employees || [])
        await Promise.all([loadRates(), loadSaved(), loadAccess()])
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this page.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadAccess, loadRates, loadSaved])

  const employeeChoices = employees.filter((e) => employeeType === 'all' || e.employeeType === employeeType)
  const poChoices = pos.filter((p) => clientIds.length === 0 || clientIds.includes(p.clientId))

  const openRate = rates.find((r) => r.userId === addUserId && !r.effectiveTo)
  const proposedTo = addCurrent ? null : addTo || null
  const needsClose =
    !!openRate &&
    !!addFrom &&
    (addCurrent || !!addTo) &&
    openRate.effectiveFrom <= (proposedTo || '9999-12-31') &&
    addFrom <= '9999-12-31'

  useEffect(() => {
    const person = employees.find((e) => e.id === addUserId)
    if (person) setAddKind(person.employeeType === 'external' ? '1099' : 'w2')
  }, [addUserId, employees])

  useEffect(() => {
    if (needsClose && addFrom) setCloseOn(dayBefore(addFrom))
  }, [needsClose, addFrom])

  const statement = useMemo(() => (weeks ? buildStatement(weeks, rates) : null), [weeks, rates])

  const describeFilters = () => {
    const typeLabel = employeeType === 'all' ? 'All employee types' : employeeType === 'internal' ? 'Internal' : 'External'
    const peopleLabel =
      employeeIds.length === 0 ? 'All employees' : employeeIds.map((id) => employees.find((e) => e.id === id)?.name || id).join(', ')
    const clientLabel =
      clientIds.length === 0 ? 'All clients' : clientIds.map((id) => clients.find((c) => c.id === id)?.name || id).join(', ')
    const poLabelText =
      poIds.length === 0
        ? 'All purchase orders'
        : poIds.map((id) => pos.find((p) => p.id === id)?.poNumber || id).join(', ')
    let period = ''
    if (timeKind === 'all') period = 'All time'
    else if (timeKind === 'months') {
      period = monthIds.map((id) => months.find((m) => m.id === id)?.label || id).join(', ')
    } else period = `${formatDay(startDate)} – ${formatDay(endDate)}`
    return {
      period,
      filters: `${typeLabel} · ${peopleLabel} · ${clientLabel} · ${poLabelText} · Approved hours`,
    }
  }

  const generate = async () => {
    setGenError(null)
    if (!timeKind) {
      setGenError('Choose a timeframe.')
      return
    }
    if (timeKind === 'months' && monthIds.length === 0) {
      setGenError('Choose at least one month.')
      return
    }
    if (timeKind === 'range' && (!startDate || !endDate || startDate > endDate)) {
      setGenError('Choose a start and an end date.')
      return
    }
    const timeframe =
      timeKind === 'all'
        ? { kind: 'all' as const }
        : timeKind === 'months'
          ? { kind: 'months' as const, months: monthIds }
          : { kind: 'range' as const, start: startDate, end: endDate }
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/labor-bill-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeType,
          employeeIds,
          clientIds,
          poIds: poIds.filter((id) => poChoices.some((p) => p.id === id)),
          timeframe,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The report could not be generated.')
      const described = describeFilters()
      setWeeks(data.weeks || [])
      setPeriodLabel(described.period)
      setFilterLabel(described.filters)
      setRanAt(new Date().toISOString())
      setRanBy(viewerName)
      setReportTitle(described.period)
      setSavedId(null)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'The report could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  const saveReport = async () => {
    if (!weeks) return
    const title = reportTitle.trim()
    if (!title) {
      setGenError('Enter a name before saving.')
      return
    }
    setSaving(true)
    setGenError(null)
    try {
      const snapshot: Snapshot = {
        kind: 'labor_profit',
        generatedAt: ranAt || new Date().toISOString(),
        generatedByName: ranBy,
        periodLabel,
        filterLabel,
        weeks,
      }
      const res = await fetch('/api/reports/labor-profit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, snapshot }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The report could not be saved.')
      setSavedId(data.id)
      await loadSaved()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'The report could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const openSaved = async (id: string) => {
    setGenError(null)
    const res = await fetch(`/api/reports/labor-profit/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setGenError(data.error || 'That saved report could not be opened.')
      return
    }
    const snap = data.snapshot as Snapshot
    setWeeks(snap.weeks || [])
    setPeriodLabel(snap.periodLabel || '')
    setFilterLabel(snap.filterLabel || '')
    setRanAt(snap.generatedAt || data.createdAt)
    setRanBy(snap.generatedByName || data.createdByName || '')
    setReportTitle(data.title || '')
    setSavedId(data.id)
  }

  const deleteSaved = async (id: string) => {
    if (!confirm('Delete this saved report?')) return
    const res = await fetch(`/api/reports/labor-profit/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setGenError('That saved report could not be deleted.')
      return
    }
    if (savedId === id) setSavedId(null)
    await loadSaved()
  }

  const exportCsv = () => {
    if (!statement) return
    const header = ['Employee', 'Type', 'Client', 'PO', 'Hours', 'Bill rate', 'Revenue', 'Cost', 'Profit', 'Profit per hour', 'Margin']
    const rows: string[][] = [header]
    for (const person of statement.employees) {
      for (const line of person.lines) {
        rows.push([
          person.userName,
          person.employeeType,
          line.clientName,
          poLabel(line),
          hoursLabel(line.hours),
          billLabel(line, person.lines),
          money(line.revenue),
          line.cost == null ? '' : money(line.cost),
          line.profit == null ? '' : money(line.profit),
          line.profitPerHour == null ? '' : money(line.profitPerHour),
          line.profit == null ? '' : marginLabel(line.profit, line.revenue),
        ])
      }
      rows.push([
        `${person.userName} total`,
        '',
        '',
        '',
        hoursLabel(person.hours),
        '',
        money(person.revenue),
        person.cost == null ? '' : money(person.cost),
        person.profit == null ? '' : money(person.profit),
        '',
        person.profit == null ? '' : marginLabel(person.profit, person.revenue),
      ])
    }
    rows.push([
      'Report total',
      '',
      '',
      '',
      hoursLabel(statement.hours),
      '',
      money(statement.revenue),
      statement.cost == null ? '' : money(statement.cost),
      statement.profit == null ? '' : money(statement.profit),
      '',
      statement.profit == null ? '' : marginLabel(statement.profit, statement.coveredRevenue),
    ])
    const csv = '\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(reportTitle || 'labor-profitability').replace(/[^\w.-]+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addRate = async () => {
    setRateError(null)
    if (!addUserId || !addFrom || addAmount.trim() === '') {
      setRateError('Choose a person, a pay rate, and a start date.')
      return
    }
    setRateBusy(true)
    try {
      const res = await fetch('/api/reports/labor-profit/pay-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: addUserId,
          classification: addKind,
          amount: Number(addAmount),
          effectiveFrom: addFrom,
          effectiveTo: addCurrent ? null : addTo,
          closeOpenOn: needsClose ? closeOn : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The pay rate could not be saved.')
      setAddAmount('')
      setAddFrom('')
      setAddTo('')
      setCloseOn('')
      await loadRates()
    } catch (err) {
      setRateError(err instanceof Error ? err.message : 'The pay rate could not be saved.')
    } finally {
      setRateBusy(false)
    }
  }

  const removeRate = async (id: string) => {
    if (!confirm('Remove this pay rate?')) return
    const res = await fetch(`/api/reports/labor-profit/pay-rates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setRateError('The pay rate could not be removed.')
      return
    }
    await loadRates()
  }

  const changeAddress = async () => {
    setAccessError(null)
    setAccessBusy(true)
    try {
      const res = await fetch('/api/reports/labor-profit/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathSegment: segment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The address could not be changed.')
      const next = String(data.pathSegment || segment)
      if (next !== pathSegment) window.location.assign(`/dashboard/${next}`)
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'The address could not be changed.')
    } finally {
      setAccessBusy(false)
    }
  }

  const grant = async () => {
    if (!grantId) return
    setAccessError(null)
    setAccessBusy(true)
    try {
      const res = await fetch('/api/reports/labor-profit/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: grantId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'That person could not be added.')
      setGrantId('')
      await loadAccess()
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'That person could not be added.')
    } finally {
      setAccessBusy(false)
    }
  }

  const revoke = async (userId: string) => {
    setAccessError(null)
    const res = await fetch('/api/reports/labor-profit/access', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setAccessError(data.error || 'That person could not be removed.')
      return
    }
    await loadAccess()
  }

  const rateRows = [...rates].sort((a, b) => {
    const an = employees.find((e) => e.id === a.userId)?.name || ''
    const bn = employees.find((e) => e.id === b.userId)?.name || ''
    const name = an.localeCompare(bn, undefined, { sensitivity: 'base' })
    if (name !== 0) return name
    return a.effectiveFrom.localeCompare(b.effectiveFrom)
  })

  return (
    <div className="space-y-8">
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {isOwner && (
        <section className="print:hidden space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Address and access</h2>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Current address</p>
              <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{address}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">dashboard /</span>
              <input
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                aria-label="Address"
                className="box-border h-10 w-40 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 text-sm text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={changeAddress}
                disabled={accessBusy}
                className="box-border h-10 rounded-lg bg-orange-600 text-white px-4 text-sm font-medium disabled:opacity-50"
              >
                {accessBusy ? 'Saving…' : 'Save address'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The address changes only after you save it. Use letters, numbers, and hyphens.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="py-1 font-medium">Person</th>
                  <th className="py-1 font-medium">Access</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100">{m.name}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{m.isOwner ? 'Owner' : 'Can run reports'}</td>
                    <td className="py-2 text-right">
                      {!m.isOwner && (
                        <button type="button" onClick={() => revoke(m.userId)} className="text-sm text-red-600 dark:text-red-400">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {candidates.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={grantId}
                  onChange={(e) => setGrantId(e.target.value)}
                  className={`${controlClass} mt-0 w-auto min-w-[12rem]`}
                >
                  <option value="">Add a super admin</option>
                  {candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={grant} disabled={!grantId || accessBusy} className="box-border h-10 text-sm px-3 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                  Add
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Promoting someone to super admin does not add them here.</p>
            )}
            {accessError && <p className="text-sm text-red-600 dark:text-red-400">{accessError}</p>}
          </div>
        </section>
      )}

      <section className="print:hidden space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pay rates</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A rate is stored once and reused. Leave the end date empty when it is still current. A person with no row still appears on a report, with cost and profit left blank.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 font-medium text-right">Pay / hr</th>
                <th className="px-3 py-2 font-medium">Starts</th>
                <th className="px-3 py-2 font-medium">Ends</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rateRows.map((r) => {
                const person = employees.find((e) => e.id === r.userId)
                return (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{person?.name || 'Unknown'}</td>
                    <td className="px-3 py-2 uppercase">{r.classification}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="px-3 py-2">{formatDay(r.effectiveFrom)}</td>
                    <td className="px-3 py-2">{r.effectiveTo ? formatDay(r.effectiveTo) : 'Current'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeRate(r.id)} className="text-red-600 dark:text-red-400">
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rateRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-gray-500 dark:text-gray-400">
                    No pay rates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300 w-full lg:w-[calc((100%-1.5rem)/4.5)]">
            Employee
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className={controlClass}
            >
              <option value="">Select</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-grid text-sm text-gray-700 dark:text-gray-300">
            <span className="col-start-1 row-start-1 whitespace-nowrap">Classification</span>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as PayKind)}
              className={`${controlClass} col-start-1 row-start-2 !w-0 !min-w-full px-2`}
            >
              <option value="w2">W2</option>
              <option value="1099">1099</option>
            </select>
          </label>
          <label className="inline-grid text-sm text-gray-700 dark:text-gray-300">
            <span className="col-start-1 row-start-1 whitespace-nowrap">Pay per hour</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className={`${controlClass} col-start-1 row-start-2 !w-0 !min-w-full px-2`}
            />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Starts
            <input
              type="date"
              value={addFrom}
              onChange={(e) => setAddFrom(e.target.value)}
              className={controlClass}
            />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 mt-6">
            <input type="checkbox" checked={addCurrent} onChange={(e) => setAddCurrent(e.target.checked)} />
            Current (no end date)
          </label>
          {!addCurrent && (
            <label className="text-sm text-gray-700 dark:text-gray-300">
              Ends
              <input
                type="date"
                value={addTo}
                onChange={(e) => setAddTo(e.target.value)}
                className={controlClass}
              />
            </label>
          )}
          {needsClose && (
            <label className="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
              End the current rate on
              <input
                type="date"
                value={closeOn}
                onChange={(e) => setCloseOn(e.target.value)}
                className={controlClass}
              />
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={addRate}
          disabled={rateBusy}
          className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Add pay rate
        </button>
        {rateError && <p className="text-sm text-red-600 dark:text-red-400">{rateError}</p>}
      </section>

      <section className="print:hidden space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generate</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Employee type
            <select
              value={employeeType}
              onChange={(e) => {
                setEmployeeType(e.target.value as 'all' | 'internal' | 'external')
                setEmployeeIds([])
              }}
              className={controlClass}
            >
              <option value="all">All</option>
              <option value="internal">Internal</option>
              <option value="external">External</option>
            </select>
          </label>
          <MultiSelectDropdown
            label="Employees"
            options={employeeChoices.map((e) => ({ id: e.id, label: e.name }))}
            selected={employeeIds}
            onChange={setEmployeeIds}
            buttonClassName={dropdownClass}
          />
          <MultiSelectDropdown
            label="Clients"
            options={clients.map((c) => ({ id: c.id, label: c.name }))}
            selected={clientIds}
            onChange={(ids) => {
              setClientIds(ids)
              setPoIds((prev) => prev.filter((id) => pos.some((p) => p.id === id && (ids.length === 0 || ids.includes(p.clientId)))))
            }}
            buttonClassName={dropdownClass}
          />
          <MultiSelectDropdown
            label="Purchase orders"
            options={poChoices.map((p) => ({
              id: p.id,
              label: `${p.poNumber}${p.projectName ? ` · ${p.projectName}` : ''} (${p.clientName})`,
            }))}
            selected={poIds}
            onChange={setPoIds}
            buttonClassName={dropdownClass}
          />
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Timeframe
            <select
              value={timeKind}
              onChange={(e) => setTimeKind(e.target.value as TimeKind | '')}
              className={controlClass}
            >
              <option value="">Choose</option>
              <option value="all">All time</option>
              <option value="months">Specific months</option>
              <option value="range">Start and end</option>
            </select>
          </label>
          {timeKind === 'months' && (
            <MultiSelectDropdown
              label="Months"
              options={months}
              selected={monthIds}
              onChange={setMonthIds}
              allLabel="Choose months"
              buttonClassName={dropdownClass}
            />
          )}
          {timeKind === 'range' && (
            <>
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Start
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={controlClass} />
              </label>
              <label className="text-sm text-gray-700 dark:text-gray-300">
                End
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={controlClass} />
              </label>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="rounded bg-orange-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">Generating does not print and does not save.</p>
        {genError && <p className="text-sm text-red-600 dark:text-red-400">{genError}</p>}
      </section>

      {statement && (
        <section className="space-y-4">
          <div className="print:hidden flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.print()} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm">
              Print
            </button>
            <button type="button" onClick={exportCsv} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm">
              Export CSV
            </button>
            <input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm min-w-[12rem]"
              aria-label="Report name"
            />
            <button
              type="button"
              onClick={saveReport}
              disabled={saving || !!savedId}
              className="rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {savedId ? 'Saved' : saving ? 'Saving…' : 'Save'}
            </button>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {savedId
                ? 'Kept for 1 year. You can open it later and print then.'
                : 'Only on this screen until you save. Leaving drops this run.'}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Labor profitability</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {periodLabel} · {filterLabel}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {ranBy}
              {ranAt ? ` · ${formatDay(ranAt.slice(0, 10))}` : ''}
              {savedId ? '' : ' · Not saved'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Hours" value={hoursLabel(statement.hours)} />
            <Stat label="Revenue" value={money(statement.revenue)} />
            <Stat label="Loaded cost" value={statement.cost == null ? '—' : money(statement.cost)} />
            <Stat label="Estimated profit" value={statement.profit == null ? '—' : money(statement.profit)} />
            <Stat
              label={statement.people === statement.peopleWithPay ? 'Margin' : `Margin, ${statement.peopleWithPay} of ${statement.people} people`}
              value={statement.profit == null ? '—' : marginLabel(statement.profit, statement.coveredRevenue)}
            />
          </div>

          {statement.employees.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">No approved hours match these filters.</p>
          )}

          <style>{`@media print { @page { size: landscape; } }`}</style>
          {statement.employees.map((person) => (
            <div key={person.userId} className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {person.userName} · {person.employeeType === 'external' ? 'External' : 'Internal'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {person.missingPay && person.payCaptions.length === 0
                  ? 'No pay rate for these weeks. Revenue is shown. Cost and profit stay blank.'
                  : person.payCaptions.join(' · ')}
                {person.missingPay && person.payCaptions.length > 0 ? ' · Some weeks have no pay rate.' : ''}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1 pr-3 font-medium">Client</th>
                      <th className="py-1 pr-3 font-medium">PO</th>
                      <th className="py-1 pr-3 font-medium text-right">Hours</th>
                      <th className="py-1 pr-3 font-medium text-right">Bill rate</th>
                      <th className="py-1 pr-3 font-medium text-right">Revenue</th>
                      <th className="py-1 pr-3 font-medium text-right">Cost</th>
                      <th className="py-1 pr-3 font-medium text-right">Profit</th>
                      <th className="py-1 pr-3 font-medium text-right">Profit / hr</th>
                      <th className="py-1 font-medium text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {person.lines.map((line, i) => (
                      <tr key={`${line.poNumber}-${line.weekFrom}-${i}`} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 pr-3">{line.clientName}</td>
                        <td className="py-1.5 pr-3">{poLabel(line)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{hoursLabel(line.hours)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{billLabel(line, person.lines)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(line.revenue)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{line.cost == null ? '—' : money(line.cost)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{line.profit == null ? '—' : money(line.profit)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{line.profitPerHour == null ? '—' : money(line.profitPerHour)}</td>
                        <td className="py-1.5 text-right tabular-nums">{line.profit == null ? '—' : marginLabel(line.profit, line.revenue)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-3">Total</td>
                      <td />
                      <td className="py-1.5 pr-3 text-right tabular-nums">{hoursLabel(person.hours)}</td>
                      <td />
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(person.revenue)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{person.cost == null ? '—' : money(person.cost)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{person.profit == null ? '—' : money(person.profit)}</td>
                      <td />
                      <td className="py-1.5 text-right tabular-nums">{person.profit == null ? '—' : marginLabel(person.profit, person.revenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="print:hidden space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Saved reports</h2>
        {saved.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">None saved.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {saved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <button type="button" onClick={() => openSaved(r.id)} className="text-left text-gray-900 dark:text-gray-100 hover:underline">
                  {r.title}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {r.createdByName || 'Unknown'} · {formatDay(r.createdAt.slice(0, 10))}
                  </span>
                </button>
                <button type="button" onClick={() => deleteSaved(r.id)} className="text-red-600 dark:text-red-400">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}
