'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'

interface ClientCardProps {
  site: any
  onSave: () => void
  onClose: () => void
  readOnly?: boolean
}

export default function ClientCard({ site, onSave, onClose, readOnly = false }: ClientCardProps) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: site.name || '',
    contact: site.contact || '',
    address_street: site.address_street || site.address || '',
    address_city: site.address_city || '',
    address_state: site.address_state || '',
    address_zip: site.address_zip || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await supabase
        .from('sites')
        .update({
          name: form.name,
          contact: form.contact || null,
          address_street: form.address_street || null,
          address_city: form.address_city || null,
          address_state: form.address_state || null,
          address_zip: form.address_zip || null,
        })
        .eq('id', site.id)
      onSave()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Client: {site.name}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Client / Site *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Contact</label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Street"
                value={form.address_street}
                onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                disabled={readOnly}
                className={inputClass}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="City"
                  value={form.address_city}
                  onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                  disabled={readOnly}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="State"
                  value={form.address_state}
                  onChange={(e) => setForm({ ...form, address_state: e.target.value })}
                  disabled={readOnly}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Zip"
                  value={form.address_zip}
                  onChange={(e) => setForm({ ...form, address_zip: e.target.value })}
                  disabled={readOnly}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {!readOnly && (
            <div className="flex gap-2 pt-4">
              <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
