'use client'

import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { formatDateForInput, isValidDateInputValue } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

type PeriodEntry = { month: number; year: number }

function getInitialPeriods(invoice?: any): PeriodEntry[] {
  if (invoice?.periods?.length) {
    return invoice.periods.map((p: any) => ({ month: p.month, year: p.year }))
  }
  const m = invoice?.period_month ?? new Date().getMonth() + 1
  const y = invoice?.period_year ?? new Date().getFullYear()
  return [{ month: m, year: y }]
}

type PaymentReceivedDate = { month: number; day: number; year: number } | null

function parsePaymentReceivedDate(val: string | null | undefined): PaymentReceivedDate {
  if (!val || typeof val !== 'string') return null
  try {
    const d = parseISO(val)
    if (isNaN(d.getTime())) return null
    return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() }
  } catch {
    return null
  }
}

function toYyyyMmDd(d: PaymentReceivedDate): string | null {
  if (!d || !d.month || !d.day || !d.year) return null
  const dt = new Date(d.year, d.month - 1, d.day)
  if (isNaN(dt.getTime())) return null
  return format(dt, 'yyyy-MM-dd')
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const YEARS = Array.from({ length: 11 }, (_, i) => 2020 + i)

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
    periods: getInitialPeriods(invoice),
    amount: invoice?.amount != null ? String(invoice.amount) : '',
    payment_received_date: parsePaymentReceivedDate(invoice?.payment_received_date),
    notes: invoice?.notes || '',
  })

  const handleClearPaymentReceivedDate = async () => {
    if (!isEdit || !invoice?.id) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/budget/${poId}/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_received_date: null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to clear')
      }
      setForm((f) => ({ ...f, payment_received_date: null }))
      onSave()
    } catch (e: any) {
      setError(e.message || 'Failed to clear')
    } finally {
      setLoading(false)
    }
  }

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
        periods: form.periods.map((p) => ({ month: parseInt(String(p.month), 10), year: parseInt(String(p.year), 10) })),
        amount: parseFloat(String(form.amount)),
        payment_received_date: toYyyyMmDd(form.payment_received_date),
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
            <input type="date" value={form.invoice_date} onChange={(e) => { const v = e.target.value; if (isValidDateInputValue(v)) setForm({ ...form, invoice_date: v }) }} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Invoice #</label>
            <input type="text" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Period(s) *</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Add multiple periods if the invoice spans more than one month.</p>
            {form.periods.map((p, i) => (
              <div key={i} className="flex gap-2 items-center mb-2">
                <select value={p.month} onChange={(e) => { const next = [...form.periods]; next[i] = { ...next[i], month: parseInt(e.target.value, 10) }; setForm({ ...form, periods: next })} } className="flex-1 h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
                <input type="number" value={p.year} onChange={(e) => { const next = [...form.periods]; next[i] = { ...next[i], year: parseInt(e.target.value, 10) }; setForm({ ...form, periods: next })} } min="2020" max="2030" className="w-24 h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                {form.periods.length > 1 && (
                  <button type="button" onClick={() => setForm({ ...form, periods: form.periods.filter((_, j) => j !== i) })} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Remove period"><Minus className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, periods: [...form.periods, { month: new Date().getMonth() + 1, year: new Date().getFullYear() }] })} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-dashed border-blue-300 dark:border-blue-600">
              <Plus className="h-4 w-4" /> Add period
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Received Date</label>
            <div className="flex gap-2 items-center flex-wrap">
              <select value={form.payment_received_date?.month ?? ''} onChange={(e) => { const v = e.target.value; const m = v ? parseInt(v, 10) : 0; setForm((f) => ({ ...f, payment_received_date: f.payment_received_date ? { ...f.payment_received_date, month: m || f.payment_received_date.month } : m ? { month: m, day: 1, year: new Date().getFullYear() } : null })) }} className="h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-w-[100px]">
                <option value="">Month</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{format(new Date(2000, m - 1), 'MMMM')}</option>
                ))}
              </select>
              <select value={form.payment_received_date?.day ?? ''} onChange={(e) => { const v = e.target.value; const d = v ? parseInt(v, 10) : 0; setForm((f) => ({ ...f, payment_received_date: f.payment_received_date ? { ...f.payment_received_date, day: d || f.payment_received_date.day } : d ? { month: new Date().getMonth() + 1, day: d, year: new Date().getFullYear() } : null })) }} className="h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-20">
                <option value="">Day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={form.payment_received_date?.year ?? ''} onChange={(e) => { const v = e.target.value; const y = v ? parseInt(v, 10) : 0; setForm((f) => ({ ...f, payment_received_date: f.payment_received_date ? { ...f.payment_received_date, year: y || f.payment_received_date.year } : y ? { month: new Date().getMonth() + 1, day: 1, year: y } : null })) }} className="h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-24">
                <option value="">Year</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {isEdit && (
                <button type="button" onClick={handleClearPaymentReceivedDate} disabled={loading} className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                  Clear
                </button>
              )}
            </div>
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
