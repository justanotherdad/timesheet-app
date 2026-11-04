'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { formatDateForInput } from '@/lib/utils'
import {
  EXPENSE_ATTACHMENT_ACCEPT,
  EXPENSE_ATTACHMENT_LIMIT,
  expenseAttachmentRejection,
} from '@/lib/expense-attachments'

interface ExpenseFormModalProps {
  poId: string
  expense?: any
  expenseTypes: Array<{ id: string; name: string }>
  readOnly?: boolean
  onSave: () => void | Promise<void>
  onClose: () => void
}

type SavedAttachment = {
  id: string
  file_name: string
  pending?: false
}

type PendingAttachment = {
  id: string
  file_name: string
  file: File
  pending: true
}

type AttachmentRow = SavedAttachment | PendingAttachment

export default function ExpenseFormModal({ poId, expense, expenseTypes, readOnly = false, onSave, onClose }: ExpenseFormModalProps) {
  const [persistedId, setPersistedId] = useState<string | null>(expense?.id ?? null)
  const isEdit = !!persistedId
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
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFiles, setSavedFiles] = useState<SavedAttachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [form, setForm] = useState({
    expense_type_id: expense?.expense_type_id || '',
    custom_type_name: expense?.custom_type_name || '',
    amount: expense?.amount != null ? String(expense.amount) : '',
    expense_date: expense?.expense_date ? formatDateForInput(expense.expense_date) : formatDateForInput(new Date()),
    notes: expense?.notes || '',
  })

  const fileCount = savedFiles.length + pendingFiles.length
  const atCap = fileCount >= EXPENSE_ATTACHMENT_LIMIT

  async function loadSavedFiles(expenseId: string) {
    const res = await fetch(`/api/budget/${poId}/expenses/${expenseId}/attachments?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!res.ok) return
    const body = await res.json().catch(() => ({}))
    setSavedFiles(Array.isArray(body.attachments) ? body.attachments : [])
  }

  useEffect(() => {
    if (!persistedId) return
    let cancelled = false
    fetch(`/api/budget/${poId}/expenses/${persistedId}/attachments?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { attachments: [] }))
      .then((body) => {
        if (!cancelled) setSavedFiles(Array.isArray(body.attachments) ? body.attachments : [])
      })
      .catch(() => {
        if (!cancelled) setSavedFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [poId, persistedId])

  async function uploadOne(expenseId: string, file: File) {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/budget/${poId}/expenses/${expenseId}/attachments`, {
      method: 'POST',
      body,
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Upload failed')
    }
    return res.json()
  }

  async function addChosenFiles(list: FileList | null) {
    if (!list?.length || readOnly) return
    setError(null)
    let count = savedFiles.length + pendingFiles.length
    const accepted: File[] = []
    let problem: string | null = null
    for (const file of Array.from(list)) {
      const reason = expenseAttachmentRejection(file.name, file.size, count)
      if (reason) {
        problem = reason
        if (count >= EXPENSE_ATTACHMENT_LIMIT) break
        continue
      }
      accepted.push(file)
      count += 1
    }
    if (!accepted.length) {
      setError(problem)
      return
    }
    if (persistedId) {
      setUploading(true)
      try {
        for (const file of accepted) {
          await uploadOne(persistedId, file)
        }
        await loadSavedFiles(persistedId)
        await onSave()
        if (problem) setError(problem)
      } catch (e: any) {
        setError(e.message || 'Upload failed')
        await loadSavedFiles(persistedId)
        await onSave()
      } finally {
        setUploading(false)
      }
      return
    }
    setPendingFiles((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file_name: file.name,
        file,
        pending: true as const,
      })),
    ])
    if (problem) setError(problem)
  }

  async function removeFile(row: AttachmentRow) {
    setError(null)
    if (row.pending) {
      setPendingFiles((current) => current.filter((file) => file.id !== row.id))
      return
    }
    if (!persistedId || readOnly) return
    const res = await fetch(`/api/budget/${poId}/expenses/${persistedId}/attachments/${row.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError((err as { error?: string }).error || 'Delete failed')
      return
    }
    setSavedFiles((current) => current.filter((file) => file.id !== row.id))
    await onSave()
  }

  async function openFile(row: AttachmentRow) {
    if (row.pending) {
      window.open(URL.createObjectURL(row.file))
      return
    }
    if (!persistedId) return
    const res = await fetch(`/api/budget/${poId}/expenses/${persistedId}/attachments/${row.id}/download`, {
      credentials: 'include',
    })
    if (!res.ok) {
      setError('Could not open that file.')
      return
    }
    const { url } = await res.json()
    if (url) window.open(url)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setError(null)
    setLoading(true)
    try {
      const url = persistedId ? `/api/budget/${poId}/expenses/${persistedId}` : `/api/budget/${poId}/expenses`
      const method = persistedId ? 'PATCH' : 'POST'
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
      const saved = await res.json().catch(() => ({}))
      const expenseId = (saved as { id?: string }).id || persistedId
      if (!expenseId) throw new Error('Failed to save')
      if (pendingFiles.length) {
        setPersistedId(expenseId)
        const stillPending: PendingAttachment[] = []
        let uploadError: string | null = null
        for (const item of pendingFiles) {
          try {
            await uploadOne(expenseId, item.file)
          } catch (uploadErr: any) {
            stillPending.push(item)
            uploadError = uploadError || uploadErr.message || 'Upload failed'
          }
        }
        setPendingFiles(stillPending)
        await loadSavedFiles(expenseId)
        await onSave()
        if (uploadError) {
          setError(uploadError)
          return
        }
      }
      await onSave()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const rows: AttachmentRow[] = [...savedFiles, ...pendingFiles]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{readOnly ? 'Expense' : isEdit ? 'Edit Expense' : 'Add Expense'}</h3>
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
              <input type="radio" checked={!useCustom} onChange={() => setUseCustom(false)} disabled={readOnly} className="rounded" />
              <span>Predefined</span>
            </label>
            {!useCustom && (
              <select value={form.expense_type_id} onChange={(e) => setForm({ ...form, expense_type_id: e.target.value })} disabled={readOnly} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                <option value="">{typesLoading ? 'Loading...' : '-- Select --'}</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="radio" checked={useCustom} onChange={() => setUseCustom(true)} disabled={readOnly} className="rounded" />
              <span>Custom</span>
            </label>
            {useCustom && (
              <input type="text" value={form.custom_type_name} onChange={(e) => setForm({ ...form, custom_type_name: e.target.value })} placeholder="Custom type" disabled={readOnly} className="w-full px-3 py-2 border rounded-lg mt-1" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required disabled={readOnly} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required disabled={readOnly} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={readOnly} className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Attachments</label>
              <span className="text-sm text-gray-500 dark:text-gray-400">{fileCount} of {EXPENSE_ATTACHMENT_LIMIT}</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No attachments</p>
            ) : (
              <div className="space-y-2 mb-2">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <button type="button" onClick={() => openFile(row)} className="truncate text-left text-sm hover:text-blue-600 dark:hover:text-blue-400 min-w-0 flex-1">
                      {row.file_name}
                    </button>
                    {!readOnly && (
                      <button type="button" onClick={() => removeFile(row)} className="text-sm text-red-600 shrink-0">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {atCap && !readOnly && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Remove a file to add another.</p>
            )}
            {!readOnly && (
              <label className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white ${atCap || uploading ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}>
                {uploading ? 'Uploading...' : 'Add files'}
                <input
                  type="file"
                  accept={EXPENSE_ATTACHMENT_ACCEPT}
                  multiple
                  className="hidden"
                  disabled={atCap || uploading}
                  onChange={(e) => {
                    void addChosenFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">PDF, JPEG, PNG, GIF, WebP, Word, and Excel. 10 MB each.</p>
          </div>
          {!readOnly && (
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={loading || uploading} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
