'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'

interface ExpenseFormModalProps {
  poId: string
  expense?: any
  expenseTypes: Array<{ id: string; name: string }>
  onSave: () => void | Promise<void>
  onClose: () => void
}

export default function ExpenseFormModal({ poId, expense, expenseTypes, onSave, onClose }: ExpenseFormModalProps) {
  const isEdit = !!expense
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>(expenseTypes)
  const [typesLoading, setTypesLoading] = useState(expenseTypes.length === 0)
  useEffect(() => {
    if (expenseTypes.length > 0) {
      setTypes(expenseTypes)
      setTypesLoading(false)
      return
    }
    setTypesLoading(true)
    const t = `t=${Date.now()}`
    fetch(`/api/expense-types?${t}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } })
      .then((res) => (res.ok ? res.json() : []))
      .then((arr) => {
        setTypes(Array.isArray(arr) ? arr : [])
        setTypesLoading(false)
      })
      .catch(() => {
        setTypes([])
        setTypesLoading(false)
      })
  }, [expenseTypes.length])
  const [useCustom, setUseCustom] = useState(!!expense?.custom_type_name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    expense_type_id: expense?.expense_type_id || '',
    custom_type_name: expense?.custom_type_name || '',
    amount: expense?.amount != null ? String(expense.amount) : '',
    expense_date: expense?.expense_date ? formatDateForInput(expense.expense_date) : formatDateForInput(new Date()),
    notes: expense?.notes || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const url = isEdit ? `/api/budget/${poId}/expenses/${expense.id}` : `/api/budget/${poId}/expenses`
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = {
        expense_type_id: useCustom ? null : (form.expense_type_id || null),
        custom_type_name: useCustom ? (form.custom_type_name || null) : null,
        amount: parseFloat(String(form.amount)),
        expense_date: form.expense_date,
        notes: form.notes || null,
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{isEdit ? 'Edit Expense' : 'Add Expense'}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="radio" checked={!useCustom} onChange={() => setUseCustom(false)} className="rounded" />
              <span>Predefined</span>
            </label>
            {!useCustom && (
              <select value={form.expense_type_id} onChange={(e) => setForm({ ...form, expense_type_id: e.target.value })} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                <option value="">{typesLoading ? 'Loading...' : '-- Select --'}</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="radio" checked={useCustom} onChange={() => setUseCustom(true)} className="rounded" />
              <span>Custom</span>
            </label>
            {useCustom && (
              <input type="text" value={form.custom_type_name} onChange={(e) => setForm({ ...form, custom_type_name: e.target.value })} placeholder="Custom type" className="w-full px-3 py-2 border rounded-lg mt-1" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
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
