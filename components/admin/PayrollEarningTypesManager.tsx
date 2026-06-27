'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import {
  PAYROLL_COLUMNS,
  type PayrollEarningType,
  type PayrollAuditEntry,
} from '@/lib/payroll'
import { formatDateTimeInEastern } from '@/lib/utils'

type SortDir = 'asc' | 'desc'

/** Proportional column widths (table-fixed) so the grid fits the viewport without horizontal scroll. */
const COL_WIDTHS: Partial<Record<keyof PayrollEarningType, string>> = {
  earning_type: '13%',
  det: '5%',
  detcode: '9%',
  area: '10%',
  dropdown: '8%',
  where_value: '9%',
  overtime: '8%',
  rule: '11%',
  rule_value: '6%',
  looks_at: '11%',
}

const EMPTY_DRAFT: Partial<PayrollEarningType> = {
  earning_type: '',
  det: '',
  detcode: '',
  area: 'Billable',
  dropdown: 'N',
  where_value: '',
  overtime: 'N',
  rule: '',
  rule_value: '',
  looks_at: '',
}

export default function PayrollEarningTypesManager({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<PayrollEarningType[]>([])
  const [audit, setAudit] = useState<PayrollAuditEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, Partial<PayrollEarningType>>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof PayrollEarningType>('sort_order')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showAdd, setShowAdd] = useState(false)
  const [newRow, setNewRow] = useState<Partial<PayrollEarningType>>({ ...EMPTY_DRAFT })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payroll/earning-types', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const fetched = (body.rows || []) as PayrollEarningType[]
      setRows(fetched)
      setAudit((body.audit || []) as PayrollAuditEntry[])
      setDrafts(Object.fromEntries(fetched.map((r) => [r.id, { ...r }])))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleSort = (key: keyof PayrollEarningType) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (sortKey === 'sort_order') {
        const an = Number(av) || 0
        const bn = Number(bv) || 0
        return sortDir === 'asc' ? an - bn : bn - an
      }
      const as = String(av ?? '').toLowerCase()
      const bs = String(bv ?? '').toLowerCase()
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
    return copy
  }, [rows, sortKey, sortDir])

  const updateDraft = (id: string, key: keyof PayrollEarningType, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const isDirty = (id: string) => {
    const orig = rows.find((r) => r.id === id)
    const draft = drafts[id]
    if (!orig || !draft) return false
    return PAYROLL_COLUMNS.some((c) => String(orig[c.key] ?? '') !== String(draft[c.key] ?? ''))
  }

  const saveRow = async (id: string) => {
    const draft = drafts[id]
    if (!draft) return
    if (!String(draft.earning_type ?? '').trim()) {
      setError('Earning Type is required')
      return
    }
    setSavingId(id)
    setError(null)
    try {
      const res = await fetch('/api/payroll/earning-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, ...draft }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this earning type? This cannot be undone.')) return
    setSavingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/payroll/earning-types?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setSavingId(null)
    }
  }

  const addRow = async () => {
    if (!String(newRow.earning_type ?? '').trim()) {
      setError('Earning Type is required')
      return
    }
    setSavingId('__new__')
    setError(null)
    try {
      const res = await fetch('/api/payroll/earning-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...newRow, sort_order: rows.length + 1 }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setShowAdd(false)
      setNewRow({ ...EMPTY_DRAFT })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setSavingId(null)
    }
  }

  const renderCell = (
    value: string,
    col: (typeof PAYROLL_COLUMNS)[number],
    onChange: (v: string) => void
  ) => {
    if (readOnly) return <span className="text-gray-900 dark:text-gray-100 break-words">{value || '—'}</span>
    if (col.kind === 'dropdown') {
      return (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full px-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
        >
          {(col.options || []).map((opt) => (
            <option key={opt || 'blank'} value={opt}>{opt === '' ? '—' : opt}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full px-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 box-border"
      />
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payroll Earning Types</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Maps each earning type to its DET / DETCODE and the rules used by the Payroll export.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Earning Type
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
      )}

      {!readOnly && showAdd && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PAYROLL_COLUMNS.map((col) => (
              <div key={col.key}>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{col.label}</label>
                {renderCell(String(newRow[col.key] ?? ''), col, (v) => setNewRow((p) => ({ ...p, [col.key]: v })))}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addRow} disabled={savingId === '__new__'} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {savingId === '__new__' ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setShowAdd(false); setNewRow({ ...EMPTY_DRAFT }) }} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400 py-8 text-center">Loading…</p>
      ) : (
        <div className="w-full">
          <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <colgroup>
              {PAYROLL_COLUMNS.map((col) => (
                <col key={col.key} style={{ width: COL_WIDTHS[col.key] }} />
              ))}
              {!readOnly && <col style={{ width: '10%' }} />}
            </colgroup>
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {PAYROLL_COLUMNS.map((col) => {
                  const active = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-1.5 py-2 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none"
                    >
                      <span className="inline-flex items-center gap-1 leading-tight">
                        {col.label}
                        {active ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />) : <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />}
                      </span>
                    </th>
                  )
                })}
                {!readOnly && <th className="px-1.5 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {sortedRows.map((row) => {
                const draft = drafts[row.id] || row
                return (
                  <tr key={row.id} className="align-middle">
                    {PAYROLL_COLUMNS.map((col) => (
                      <td key={col.key} className="px-1.5 py-2">
                        {renderCell(String(draft[col.key] ?? ''), col, (v) => updateDraft(row.id, col.key, v))}
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="px-1.5 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => saveRow(row.id)}
                            disabled={savingId === row.id || !isDirty(row.id)}
                            className="bg-green-600 text-white px-2.5 py-1.5 rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-40"
                          >
                            {savingId === row.id ? '…' : 'Save'}
                          </button>
                          <button
                            onClick={() => deleteRow(row.id)}
                            disabled={savingId === row.id}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 shrink-0"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={PAYROLL_COLUMNS.length + 1} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                    No earning types yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {audit.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Recent changes</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="text-left py-1.5 pr-3 font-medium whitespace-nowrap">User</th>
                  <th className="text-left py-1.5 pr-3 font-medium whitespace-nowrap">Date</th>
                  <th className="text-left py-1.5 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">{e.actor_name?.trim() || 'Unknown'}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 whitespace-nowrap align-top">{formatDateTimeInEastern(e.created_at)}</td>
                    <td className="py-1.5 text-gray-700 dark:text-gray-300 align-top">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
