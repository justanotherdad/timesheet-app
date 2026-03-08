'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Upload, FileText, X, BarChart3 } from 'lucide-react'

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx']

interface POInfoCardProps {
  po: any
  siteId: string
  departments: Array<{ id: string; name: string; site_id: string }>
  onSave: () => void
  onClose: () => void
  onDepartmentAdded?: (dept: { id: string; name: string; site_id: string }) => void
  readOnly?: boolean
  /** When true, show View Budget Detail button (manager+ only) */
  showBudgetLink?: boolean
}

export default function POInfoCard({
  po,
  siteId,
  departments,
  onSave,
  onClose,
  onDepartmentAdded,
  readOnly = false,
  showBudgetLink = false,
}: POInfoCardProps) {
  const supabase = createClient()
  const siteDepts = departments.filter((d) => d.site_id === siteId)
  const [form, setForm] = useState({
    po_number: po.po_number || '',
    original_po_amount: po.original_po_amount ?? '',
    po_issue_date: po.po_issue_date ?? '',
    po_balance: po.po_balance ?? '',
    proposal_number: po.proposal_number ?? '',
    project_name: po.description ?? po.project_name ?? '',
    department_id: po.department_id ?? '',
    budget_type: po.budget_type || 'basic',
    prior_hours_billed: po.prior_hours_billed ?? '',
    prior_amount_spent: po.prior_amount_spent ?? '',
    prior_period_notes: po.prior_period_notes ?? '',
  })
  const [newDeptName, setNewDeptName] = useState('')
  const [showAddDept, setShowAddDept] = useState(false)
  const [changeOrders, setChangeOrders] = useState<Array<{ id?: string; co_number: string; co_date: string; amount: string }>>([])
  const [attachments, setAttachments] = useState<Array<{ id: string; file_name: string; storage_path: string; file_type?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [coRes, attRes] = await Promise.all([
        supabase.from('po_change_orders').select('*').eq('po_id', po.id).order('co_date', { ascending: false }),
        supabase.from('po_attachments').select('id, file_name, storage_path, file_type').eq('po_id', po.id),
      ])
      setChangeOrders((coRes.data || []).map((r: any) => ({ id: r.id, co_number: r.co_number || '', co_date: r.co_date || '', amount: r.amount != null ? String(r.amount) : '' })))
      setAttachments(attRes.data || [])
    }
    load()
  }, [po.id, supabase])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await supabase
        .from('purchase_orders')
        .update({
          po_number: form.po_number,
          original_po_amount: form.original_po_amount != null && form.original_po_amount !== '' ? parseFloat(String(form.original_po_amount)) : null,
          po_issue_date: form.po_issue_date || null,
          po_balance: form.po_balance != null && form.po_balance !== '' ? parseFloat(String(form.po_balance)) : null,
          proposal_number: form.proposal_number || null,
          project_name: form.project_name || null,
          description: form.project_name || null,
          department_id: form.department_id || null,
          budget_type: form.budget_type || 'basic',
          prior_hours_billed: form.prior_hours_billed != null && form.prior_hours_billed !== '' ? parseFloat(String(form.prior_hours_billed)) : null,
          prior_amount_spent: form.prior_amount_spent != null && form.prior_amount_spent !== '' ? parseFloat(String(form.prior_amount_spent)) : null,
          prior_period_notes: form.prior_period_notes || null,
        })
        .eq('id', po.id)

      for (const co of changeOrders) {
        if (co.id) {
          await supabase
            .from('po_change_orders')
            .update({
              co_number: co.co_number || null,
              co_date: co.co_date || null,
              amount: co.amount ? parseFloat(co.amount) : null,
            })
            .eq('id', co.id)
        } else if (co.co_number || co.co_date || co.amount) {
          await supabase.from('po_change_orders').insert({
            po_id: po.id,
            co_number: co.co_number || null,
            co_date: co.co_date || null,
            amount: co.amount ? parseFloat(co.amount) : null,
          })
        }
      }
      onSave()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) return
    setError(null)
    try {
      const { data, error: insertErr } = await supabase
        .from('departments')
        .insert({ site_id: siteId, name: newDeptName.trim() })
        .select()
        .single()
      if (insertErr) throw insertErr
      onDepartmentAdded?.(data)
      setForm((f) => ({ ...f, department_id: data.id }))
      setNewDeptName('')
      setShowAddDept(false)
    } catch (err: any) {
      setError(err.message || 'Failed to add department')
    }
  }

  const addChangeOrder = () => setChangeOrders([...changeOrders, { co_number: '', co_date: '', amount: '' }])
  const removeChangeOrder = (idx: number) => setChangeOrders(changeOrders.filter((_, i) => i !== idx))
  const updateChangeOrder = (idx: number, field: string, value: string) => {
    const next = [...changeOrders]
    next[idx] = { ...next[idx], [field]: value }
    setChangeOrders(next)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
        if (!ALLOWED_EXT.includes(ext)) {
          setError(`File type not allowed. Use Word, Excel, or PDF.`)
          continue
        }
        const path = `po_attachments/${po.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { error: uploadErr } = await supabase.storage.from('site-attachments').upload(path, file, { upsert: false })
        if (uploadErr) throw uploadErr
        const { data: inserted } = await supabase
          .from('po_attachments')
          .insert({
            po_id: po.id,
            file_name: file.name,
            storage_path: path,
            file_type: file.type,
            file_size: file.size,
          })
          .select('id, file_name, storage_path, file_type')
          .single()
        if (inserted) setAttachments((prev) => [...prev, inserted])
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDeleteAttachment = async (att: { id: string; storage_path: string }) => {
    try {
      await supabase.storage.from('site-attachments').remove([att.storage_path])
      await supabase.from('po_attachments').delete().eq('id', att.id)
      setAttachments((prev) => prev.filter((a) => a.id !== att.id))
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    }
  }

  const handleDownloadAttachment = async (att: { storage_path: string; file_name: string }) => {
    const { data } = await supabase.storage.from('site-attachments').createSignedUrl(att.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl)
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">PO: {po.po_number}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>PO# *</label>
              <input
                type="text"
                value={form.po_number}
                onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                required
                disabled={readOnly}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Original PO $$</label>
              <input
                type="number"
                step="0.01"
                value={form.original_po_amount}
                onChange={(e) => setForm({ ...form, original_po_amount: e.target.value })}
                disabled={readOnly}
                className={inputClass}
              />
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Orders</span>
              {!readOnly && (
                <button type="button" onClick={addChangeOrder} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm">
                  <Plus className="h-4 w-4" /> + CO #
                </button>
              )}
            </div>
            <div className="space-y-2">
              {changeOrders.map((co, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="CO #"
                    value={co.co_number}
                    onChange={(e) => updateChangeOrder(idx, 'co_number', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    disabled={readOnly}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    value={co.co_date}
                    onChange={(e) => updateChangeOrder(idx, 'co_date', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    disabled={readOnly}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="$$"
                    value={co.amount}
                    onChange={(e) => updateChangeOrder(idx, 'amount', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    disabled={readOnly}
                    className="w-24 px-3 py-2 border rounded-lg text-sm"
                  />
                  {!readOnly && (
                    <button type="button" onClick={() => removeChangeOrder(idx)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Project Name / Description</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                disabled={readOnly}
                placeholder="Same as Description in PO table"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Department</label>
              <div className="flex gap-2">
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  disabled={readOnly}
                  className={inputClass}
                >
                  <option value="">-- None --</option>
                  {siteDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setShowAddDept(!showAddDept)}
                    className="shrink-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Add department"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              {showAddDept && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="New department name"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    className={inputClass}
                  />
                  <button type="button" onClick={handleAddDepartment} className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Add
                  </button>
                  <button type="button" onClick={() => { setShowAddDept(false); setNewDeptName('') }} className="shrink-0 px-3 py-2 border rounded-lg">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>PO Issue Date</label>
              <input
                type="date"
                value={form.po_issue_date}
                onChange={(e) => setForm({ ...form, po_issue_date: e.target.value })}
                disabled={readOnly}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>PO Balance $$ (future use)</label>
              <input
                type="number"
                step="0.01"
                value={form.po_balance}
                onChange={(e) => setForm({ ...form, po_balance: e.target.value })}
                disabled={readOnly}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Proposal #</label>
            <input
              type="text"
              value={form.proposal_number}
              onChange={(e) => setForm({ ...form, proposal_number: e.target.value })}
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-900/10">
            <label className={labelClass}>Prior Period Adjustment</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">For budgets in use before timesheets were in this system. Set hours/amount already spent so the budget view reflects reality.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Prior hours billed</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.prior_hours_billed}
                  onChange={(e) => setForm({ ...form, prior_hours_billed: e.target.value })}
                  disabled={readOnly}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Prior amount spent ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.prior_amount_spent}
                  onChange={(e) => setForm({ ...form, prior_amount_spent: e.target.value })}
                  disabled={readOnly}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.prior_period_notes}
                onChange={(e) => setForm({ ...form, prior_period_notes: e.target.value })}
                disabled={readOnly}
                placeholder="e.g. Migrated from Excel - hours through Jan 2026"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Budget Type</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budget_type"
                  value="basic"
                  checked={form.budget_type === 'basic'}
                  onChange={(e) => setForm({ ...form, budget_type: e.target.value })}
                  disabled={readOnly}
                  className="rounded-full"
                />
                <span>Basic budget</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budget_type"
                  value="project"
                  checked={form.budget_type === 'project'}
                  onChange={(e) => setForm({ ...form, budget_type: e.target.value })}
                  disabled={readOnly}
                  className="rounded-full"
                />
                <span>Project budget</span>
              </label>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
            <label className={labelClass}>Attachments</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Word, Excel, or PDF files</p>
            {!readOnly && (
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 text-sm mb-3">
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : '+ PO / + Proposal'}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
            <div className="space-y-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(att)}
                    className="flex items-center gap-2 text-left hover:text-blue-600 min-w-0 flex-1"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{att.file_name}</span>
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4 items-center">
            {showBudgetLink && (
              <Link
                href={`/dashboard/budget?poId=${po.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700"
              >
                <BarChart3 className="h-4 w-4" />
                View Budget Detail
              </Link>
            )}
            {!readOnly && (
              <>
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={onClose} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
