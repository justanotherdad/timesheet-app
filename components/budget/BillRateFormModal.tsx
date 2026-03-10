'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'

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
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    user_id: rate?.user_id || '',
    rate: rate?.rate != null ? String(rate.rate) : '',
    effective_from_date: rate?.effective_from_date ? formatDateForInput(rate.effective_from_date) : formatDateForInput(new Date()),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const url = isEdit ? `/api/budget/${poId}/bill-rates/${rate.id}` : `/api/budget/${poId}/bill-rates`
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = {
        rate: parseFloat(String(form.rate)),
        effective_from_date: form.effective_from_date,
      }
      if (!isEdit) body.user_id = form.user_id

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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
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
              <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required className="w-full px-3 py-2 border rounded-lg">
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
            <input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Effective From Date *</label>
            <input type="date" value={form.effective_from_date} onChange={(e) => setForm({ ...form, effective_from_date: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
            <p className="text-xs text-gray-500 mt-1">Historical data uses the rate that was effective at that time.</p>
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
