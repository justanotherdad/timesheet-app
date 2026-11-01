'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'

type OtherBillRate = {
  po_id: string
  po_number: string
  site_name: string
  project_description: string
  rate: number
  effective_from_date: string | null
  effective_to_date: string | null
  current: boolean
}

function formatRateDate(value: string | null | undefined): string {
  if (!value) return ''
  const ymd = String(value).slice(0, 10)
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface BillRateFormModalProps {
  poId: string
  rate?: any
  users: Array<{ id: string; name: string }>
  onSave: () => void
  onClose: () => void
}

export default function BillRateFormModal({ poId, rate, users: usersProp, onSave, onClose }: BillRateFormModalProps) {
  const isEdit = !!rate
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>(usersProp)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otherRates, setOtherRates] = useState<OtherBillRate[] | null>(null)
  const [otherRatesLoading, setOtherRatesLoading] = useState(false)
  const [form, setForm] = useState({
    user_id: rate?.user_id || '',
    rate: rate?.rate != null ? String(rate.rate) : '',
    effective_from_date: rate?.effective_from_date ? formatDateForInput(rate.effective_from_date) : formatDateForInput(new Date()),
    effective_to_date: rate?.effective_to_date ? formatDateForInput(rate.effective_to_date) : '',
  })

  useEffect(() => {
    if (!isEdit) {
      fetch(`/api/budget/${poId}/users`, { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : null)
        .then((json) => {
          if (json?.users?.length) setUsers(json.users)
        })
        .catch(() => {})
    }
  }, [poId, isEdit])

  useEffect(() => {
    if (isEdit || !form.user_id) {
      setOtherRates(null)
      setOtherRatesLoading(false)
      return
    }
    let cancelled = false
    setOtherRatesLoading(true)
    fetch(`/api/users/${form.user_id}/bill-rate-pos?history=1&t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return
        const rows = ((json?.rows || []) as OtherBillRate[]).filter((row) => row.po_id !== poId)
        setOtherRates(rows)
      })
      .catch(() => {
        if (!cancelled) setOtherRates([])
      })
      .finally(() => {
        if (!cancelled) setOtherRatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [form.user_id, isEdit, poId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const toTrim = form.effective_to_date.trim()
    if (toTrim && form.effective_from_date && toTrim < form.effective_from_date) {
      setError('Effective to date must be on or after effective from date.')
      return
    }
    setLoading(true)
    try {
      const url = isEdit ? `/api/budget/${poId}/bill-rates/${rate.id}` : `/api/budget/${poId}/bill-rates`
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        rate: parseFloat(String(form.rate)),
        effective_from_date: form.effective_from_date,
      }
      if (!isEdit) body.user_id = form.user_id
      if (isEdit) {
        body.effective_to_date = toTrim === '' ? null : toTrim
      } else if (toTrim) {
        body.effective_to_date = toTrim
      }

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      await onSave()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{isEdit ? 'Edit Bill Rate' : 'Add Bill Rate'}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium mb-1">Employee *</label>
              <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                <option value="">-- Select employee --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {users.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No users with profiles found. Add users in User Management first.</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Rate ($/hr) *</label>
            <input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Effective From Date *</label>
            <input type="date" value={form.effective_from_date} onChange={(e) => setForm({ ...form, effective_from_date: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            <p className="text-xs text-gray-500 mt-1">Historical data uses the rate that was effective at that time.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Effective To Date</label>
            <input
              type="date"
              value={form.effective_to_date}
              min={form.effective_from_date || undefined}
              onChange={(e) => setForm({ ...form, effective_to_date: e.target.value })}
              className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Optional. Leave blank while the assignment is ongoing. Use Remove from PO to require an end date when offboarding.</p>
          </div>
          {!isEdit && form.user_id && (
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Other rates for this person</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">Current and previous rates on other budgets.</p>
              {otherRatesLoading ? (
                <p className="text-sm text-gray-500">Loading other rates…</p>
              ) : !otherRates || otherRates.length === 0 ? (
                <p className="text-sm text-gray-500">No other bill rates for this person.</p>
              ) : (
                <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                  {otherRates.map((row, i) => {
                    const from = formatRateDate(row.effective_from_date)
                    const to = row.effective_to_date ? formatRateDate(row.effective_to_date) : 'open'
                    return (
                      <li key={`${row.po_id}-${row.effective_from_date || ''}-${i}`} className="px-3 py-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{row.po_number}</span>
                          <span className="shrink-0 text-gray-900 dark:text-gray-100">${Number(row.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {row.site_name} · {row.project_description}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {row.current ? 'Current' : 'Ended'} · {from || '—'} – {to}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
