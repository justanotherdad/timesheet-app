'use client'

import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'

interface BillRateRemoveModalProps {
  poId: string
  rate: {
    id: string
    effective_from_date?: string | null
    user_profiles?: { name?: string | null } | null
  }
  onSave: () => void
  onClose: () => void
}

export default function BillRateRemoveModal({ poId, rate, onSave, onClose }: BillRateRemoveModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const minDate = useMemo(() => {
    if (!rate.effective_from_date) return ''
    return formatDateForInput(rate.effective_from_date)
  }, [rate.effective_from_date])
  const [effectiveToDate, setEffectiveToDate] = useState(() => formatDateForInput(new Date()))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!effectiveToDate) {
      setError('End date is required to remove someone from this PO.')
      return
    }
    if (minDate && effectiveToDate < minDate) {
      setError('End date must be on or after the effective from date for this rate row.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/budget/${poId}/bill-rates/${rate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ effective_to_date: effectiveToDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || 'Failed to save')
      }
      await onSave()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const name = rate.user_profiles?.name || 'This person'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Remove from PO</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Set an end date for <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>. Past timesheets and labor history stay intact; they will no longer appear on new timesheets for this PO after that date.
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">End date *</label>
            <input
              type="date"
              value={effectiveToDate}
              min={minDate || undefined}
              onChange={(e) => setEffectiveToDate(e.target.value)}
              required
              className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Last day this assignment is active for billing and new time entry.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-amber-600 text-white py-2 rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Confirm removal'}
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
