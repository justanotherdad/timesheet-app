'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'

interface InvoiceFormModalProps {
  poId: string
  invoice?: any
  onSave: () => void
  onClose: () => void
}

export default function InvoiceFormModal({ poId, invoice, onSave, onClose }: InvoiceFormModalProps) {
  const isEdit = !!invoice
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    invoice_date: invoice?.invoice_date ? formatDateForInput(invoice.invoice_date) : formatDateForInput(new Date()),
    invoice_number: invoice?.invoice_number || '',
    period_month: invoice?.period_month ?? new Date().getMonth() + 1,
    period_year: invoice?.period_year ?? new Date().getFullYear(),
    amount: invoice?.amount != null ? String(invoice.amount) : '',
    payment_received_date: invoice?.payment_received_date ? formatDateForInput(invoice.payment_received_date) : '',
    notes: invoice?.notes || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const url = isEdit ? `/api/budget/${poId}/invoices/${invoice.id}` : `/api/budget/${poId}/invoices`
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = {
        invoice_date: form.invoice_date,
        invoice_number: form.invoice_number || null,
        period_month: parseInt(String(form.period_month), 10),
        period_year: parseInt(String(form.period_year), 10),
        amount: parseFloat(String(form.amount)),
        payment_received_date: form.payment_received_date || null,
        notes: form.notes || null,
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      onSave()
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
          <h3 className="text-lg font-semibold">{isEdit ? 'Edit Invoice' : 'Add Invoice'}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Invoice Date *</label>
            <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Invoice #</label>
            <input type="text" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Period Month *</label>
              <select value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} required className="w-full px-3 py-2 border rounded-lg">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Period Year *</label>
              <input type="number" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: e.target.value })} min="2020" max="2030" required className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Received Date</label>
            <input type="date" value={form.payment_received_date} onChange={(e) => setForm({ ...form, payment_received_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
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
