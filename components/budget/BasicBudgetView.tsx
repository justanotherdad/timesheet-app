'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
import { formatDate, formatDateShort } from '@/lib/utils'
import InvoiceFormModal from './InvoiceFormModal'
import ExpenseFormModal from './ExpenseFormModal'
import BillRateFormModal from './BillRateFormModal'

interface BasicBudgetViewProps {
  po: any
  sites?: Array<{ id: string; name?: string; address_street?: string; address_city?: string; address_state?: string; address_zip?: string; contact?: string }>
  onBack: () => void
  user?: { id: string; profile: { role: string } }
  /** For navigation: sites, POs for current site, and callbacks. Access already filtered by parent. */
  allSites?: Array<{ id: string; name?: string }>
  sitePOs?: Array<{ id: string; po_number: string; site_id: string; description?: string; departments?: { name: string } }>
  selectedSiteId?: string
  selectedPoId?: string
  onSelectSite?: (siteId: string) => void
  onSelectPo?: (poId: string) => void
  onPrev?: () => void
  onNext?: () => void
}

export default function BasicBudgetView({
  po,
  sites: sitesProp = [],
  onBack,
  user,
  allSites = [],
  sitePOs = [],
  selectedSiteId = '',
  selectedPoId = '',
  onSelectSite,
  onSelectPo,
  onPrev,
  onNext,
}: BasicBudgetViewProps) {
  const [data, setData] = useState<any>(null)
  const [changeOrdersOverride, setChangeOrdersOverride] = useState<any[] | null>(null)
  const [billRatesOverride, setBillRatesOverride] = useState<any[] | null>(null)
  const [billableData, setBillableData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showAllMonths, setShowAllMonths] = useState(false)
  const [employeePopup, setEmployeePopup] = useState<{ userId: string; userName: string; weekData: Record<string, { hours: number; timesheetId: string }> } | null>(null)
  const [invoiceModal, setInvoiceModal] = useState<any>(null)
  const [expenseModal, setExpenseModal] = useState<any>(null)
  const [billRateModal, setBillRateModal] = useState<any>(null)
  const [billableSortColumn, setBillableSortColumn] = useState<string>('employee')
  const [billableSortDir, setBillableSortDir] = useState<'asc' | 'desc'>('asc')
  const [laborCostData, setLaborCostData] = useState<any>(null)
  const [editingClientPO, setEditingClientPO] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [clientPOForm, setClientPOForm] = useState({
    po_number: '',
    department_id: '',
    project_name: '',
    po_issue_date: '',
    proposal_number: '',
  })
  const [budgetForm, setBudgetForm] = useState<{
    original_po_amount: string
    prior_hours_billed: string
    prior_amount_spent: string
    prior_period_notes: string
    changeOrders: Array<{ id?: string; co_number: string; co_date: string; amount: string }>
  }>({
    original_po_amount: '',
    prior_hours_billed: '',
    prior_amount_spent: '',
    prior_period_notes: '',
    changeOrders: [],
  })

  const refetch = useCallback(async () => {
    const [res, coRes, brRes, laborRes] = await Promise.all([
      fetch(`/api/budget/${po.id}`),
      fetch(`/api/budget/${po.id}/change-orders`),
      fetch(`/api/budget/${po.id}/bill-rates`),
      fetch(`/api/budget/${po.id}/billable-hours?all=true`),
    ])
    if (res.ok) setData(await res.json())
    if (coRes.ok) {
      const json = await coRes.json()
      setChangeOrdersOverride(Array.isArray(json) ? json : [])
    } else setChangeOrdersOverride(null)
    if (brRes.ok) {
      const json = await brRes.json()
      setBillRatesOverride(Array.isArray(json) ? json : null)
    } else setBillRatesOverride(null)
    if (laborRes.ok) setLaborCostData(await laborRes.json())
  }, [po.id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [res, bhRes, coRes, brRes, laborRes] = await Promise.all([
          fetch(`/api/budget/${po.id}`),
          fetch(`/api/budget/${po.id}/billable-hours?${showAllMonths ? 'all=true' : `month=${selectedMonth.split('-')[1]}&year=${selectedMonth.split('-')[0]}`}`),
          fetch(`/api/budget/${po.id}/change-orders`),
          fetch(`/api/budget/${po.id}/bill-rates`),
          fetch(`/api/budget/${po.id}/billable-hours?all=true`),
        ])
        if (res.ok) setData(await res.json())
        if (bhRes.ok) setBillableData(await bhRes.json())
        if (coRes.ok) {
          const json = await coRes.json()
          setChangeOrdersOverride(Array.isArray(json) ? json : [])
        } else setChangeOrdersOverride(null)
        if (brRes.ok) {
          const json = await brRes.json()
          setBillRatesOverride(Array.isArray(json) ? json : null)
        } else setBillRatesOverride(null)
        if (laborRes.ok) setLaborCostData(await laborRes.json())
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [po.id, selectedMonth, showAllMonths])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const poData = data?.po ?? po
  const site = poData.sites || (poData.site_id && sitesProp?.length ? sitesProp.find((s) => s.id === poData.site_id) : null) || {}
  const addressParts = [site.address_street, [site.address_city, site.address_state, site.address_zip].filter(Boolean).join(', ')].filter(Boolean)
  const changeOrders = changeOrdersOverride !== null ? changeOrdersOverride : (data?.changeOrders || [])
  const invoices = data?.invoices || []
  const usersFromApi = data?.users || []
  const usersFromBillable = (billableData?.rows || []).map((r: any) => ({ id: r.userId, name: r.userName }))
  const usersMap = new Map<string, { id: string; name: string }>()
  usersFromApi.forEach((u: { id: string; name: string }) => usersMap.set(u.id, u))
  usersFromBillable.forEach((u: { id: string; name: string }) => usersMap.set(u.id, u))
  const users = Array.from(usersMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const billRatesRaw = billRatesOverride !== null ? billRatesOverride : (data?.billRates || [])
  const billRates = billRatesRaw.map((br: any) => ({
    ...br,
    user_profiles: br.user_profiles ?? (br.user_id ? { id: br.user_id, name: users.find((u: any) => u.id === br.user_id)?.name || 'Unknown' } : null),
  }))
  const expenses = data?.expenses || []
  const expenseTypes = data?.expenseTypes || []
  const siteDepartmentsRaw = (data?.siteDepartments || []) as Array<{ id: string; name: string }>
  const siteDepartments = poData.department_id && poData.departments && !siteDepartmentsRaw.some((d) => d.id === poData.department_id)
    ? [{ id: poData.department_id, name: poData.departments.name || 'Unknown' }, ...siteDepartmentsRaw]
    : siteDepartmentsRaw
  const isAdmin = user && ['admin', 'super_admin'].includes(user.profile.role)
  const canEdit = user && ['manager', 'admin', 'super_admin'].includes(user.profile.role)

  const originalBudget = poData.original_po_amount ?? 0
  const coTotal = changeOrders.reduce((s: number, co: any) => s + (co.amount || 0), 0)
  const totalBudget = originalBudget + coTotal
  const priorAmountSpent = poData.prior_amount_spent ?? 0
  const priorHoursBilled = poData.prior_hours_billed ?? 0
  const invoiceTotal = invoices.reduce((s: number, inv: any) => s + (inv.amount || 0), 0)
  const runningBalance = totalBudget - priorAmountSpent - invoiceTotal

  const getEffectiveRate = (userId: string, dateStr: string) => {
    const userRates = (billRatesRaw || [])
      .filter((br: any) => br.user_id === userId && (br.effective_from_date || '') <= dateStr)
      .sort((a: any, b: any) => (b.effective_from_date || '').localeCompare(a.effective_from_date || ''))
    return userRates[0]?.rate ?? 0
  }

  let laborCost = 0
  for (const row of laborCostData?.rows || []) {
    for (const [weekEnding, wd] of Object.entries(row.weekData || {})) {
      const hours = (wd as { hours?: number }).hours ?? 0
      if (hours > 0) {
        const rate = getEffectiveRate(row.userId, weekEnding)
        laborCost += rate * hours
      }
    }
  }

  const budgetBalance = totalBudget - priorAmountSpent - laborCost

  const rows = billableData?.rows || []
  const weekEndings = billableData?.weekEndings || []
  const columnTotals = billableData?.columnTotals || {}
  const grandTotalFromTimesheets = billableData?.grandTotal || 0
  const grandTotal = grandTotalFromTimesheets + priorHoursBilled

  const handleBillableSort = (col: string) => {
    if (billableSortColumn === col) {
      setBillableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setBillableSortColumn(col)
      setBillableSortDir(col === 'employee' ? 'asc' : 'desc')
    }
  }
  const billableSortIcon = (col: string) => {
    if (billableSortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return billableSortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }
  const sortedRows = [...rows].sort((a: any, b: any) => {
    const mult = billableSortDir === 'asc' ? 1 : -1
    let aVal: string | number, bVal: string | number
    if (billableSortColumn === 'employee') {
      aVal = (a.userName || '').toLowerCase()
      bVal = (b.userName || '').toLowerCase()
      return mult * (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
    }
    if (billableSortColumn === 'total') {
      aVal = a.rowTotal ?? 0
      bVal = b.rowTotal ?? 0
      return mult * (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
    }
    aVal = a.weekData?.[billableSortColumn]?.hours ?? 0
    bVal = b.weekData?.[billableSortColumn]?.hours ?? 0
    return mult * (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
  })

  const startEditClientPO = () => {
    setClientPOForm({
      po_number: poData.po_number || '',
      department_id: poData.department_id || '',
      project_name: poData.description ?? poData.project_name ?? '',
      po_issue_date: poData.po_issue_date ? String(poData.po_issue_date).slice(0, 10) : '',
      proposal_number: poData.proposal_number || '',
    })
    setEditingClientPO(true)
    setSaveError(null)
  }

  const saveClientPO = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/budget/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientPOForm),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      await refetch()
      setEditingClientPO(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const startEditBudget = () => {
    setBudgetForm({
      original_po_amount: poData.original_po_amount != null ? String(poData.original_po_amount) : '',
      prior_hours_billed: poData.prior_hours_billed != null ? String(poData.prior_hours_billed) : '',
      prior_amount_spent: poData.prior_amount_spent != null ? String(poData.prior_amount_spent) : '',
      prior_period_notes: poData.prior_period_notes || '',
      changeOrders: changeOrders.map((co: any) => ({
        id: co.id,
        co_number: co.co_number || '',
        co_date: co.co_date ? String(co.co_date).slice(0, 10) : '',
        amount: co.amount != null ? String(co.amount) : '',
      })),
    })
    setEditingBudget(true)
    setSaveError(null)
  }

  const saveBudget = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/budget/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_po_amount: budgetForm.original_po_amount,
          prior_hours_billed: budgetForm.prior_hours_billed,
          prior_amount_spent: budgetForm.prior_amount_spent,
          prior_period_notes: budgetForm.prior_period_notes,
          changeOrders: budgetForm.changeOrders,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      await refetch()
      setEditingBudget(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addChangeOrder = () => setBudgetForm((f) => ({
    ...f,
    changeOrders: [...f.changeOrders, { co_number: '', co_date: '', amount: '' }],
  }))
  const removeChangeOrder = (idx: number) => setBudgetForm((f) => ({
    ...f,
    changeOrders: f.changeOrders.filter((_, i) => i !== idx),
  }))
  const updateChangeOrder = (idx: number, field: string, value: string) => setBudgetForm((f) => {
    const next = [...f.changeOrders]
    next[idx] = { ...next[idx], [field]: value }
    return { ...f, changeOrders: next }
  })

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-base'

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to budget list
      </button>

      {/* Navigation: prev | Client + PO dropdowns | next — above container */}
      {(allSites.length > 0 || sitePOs.length > 0) && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Previous PO"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-1 justify-center gap-2 flex-nowrap items-end shrink-0">
            {allSites.length > 0 && onSelectSite && (
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Client</label>
                <select
                  value={selectedSiteId || poData.site_id || ''}
                  onChange={(e) => onSelectSite(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select client --</option>
                  {allSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || 'Unknown'}</option>
                  ))}
                </select>
              </div>
            )}
            {sitePOs.length > 0 && onSelectPo && (
              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">PO</label>
                <select
                  value={selectedPoId || po.id}
                  onChange={(e) => onSelectPo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {sitePOs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.po_number}{(p.description || p.departments?.name) ? ` — ${p.description || p.departments?.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Next PO"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* 1. Client info + PO details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Client & PO Information</h2>
          {canEdit && !editingClientPO && (
            <button type="button" onClick={startEditClientPO} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
        {saveError && editingClientPO && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">{saveError}</div>
        )}
        {editingClientPO ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Client / Site</p>
              <p className="text-gray-900 dark:text-gray-100">{site.name}</p>
              {addressParts.length > 0 && <p className="text-gray-600 dark:text-gray-300 mt-1 text-sm">{addressParts.join(', ')}</p>}
              {site.contact && <p className="text-gray-600 dark:text-gray-300 text-sm">{site.contact}</p>}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">PO#</label>
                <input type="text" value={clientPOForm.po_number} onChange={(e) => setClientPOForm((f) => ({ ...f, po_number: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Department</label>
                <select value={clientPOForm.department_id} onChange={(e) => setClientPOForm((f) => ({ ...f, department_id: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {siteDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Project</label>
                <input type="text" value={clientPOForm.project_name} onChange={(e) => setClientPOForm((f) => ({ ...f, project_name: e.target.value }))} className={inputClass} placeholder="—" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">PO Issue Date</label>
                <input type="date" value={clientPOForm.po_issue_date} onChange={(e) => setClientPOForm((f) => ({ ...f, po_issue_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Proposal #</label>
                <input type="text" value={clientPOForm.proposal_number} onChange={(e) => setClientPOForm((f) => ({ ...f, proposal_number: e.target.value }))} className={inputClass} placeholder="—" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={saveClientPO} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingClientPO(false)} disabled={saving} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
            <div>
              <p className="font-medium text-gray-500 dark:text-gray-400">Client / Site</p>
              <p className="text-gray-900 dark:text-gray-100">{site.name}</p>
              {addressParts.length > 0 && <p className="text-gray-600 dark:text-gray-300 mt-1">{addressParts.join(', ')}</p>}
              {site.contact && <p className="text-gray-600 dark:text-gray-300">{site.contact}</p>}
            </div>
            <div className="space-y-2">
              <p><span className="font-medium text-gray-500 dark:text-gray-400">PO#:</span> {poData.po_number}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Department:</span> {poData.departments?.name || '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Project:</span> {poData.description ?? poData.project_name ?? '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">PO Issue Date:</span> {poData.po_issue_date ? formatDate(poData.po_issue_date) : '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Proposal #:</span> {poData.proposal_number || '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Budget table (original + change orders) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Budget Summary</h2>
          {canEdit && !editingBudget && (
            <button type="button" onClick={startEditBudget} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
        {saveError && editingBudget && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">{saveError}</div>
        )}
        {editingBudget ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Original PO Amount ($)</label>
              <input type="number" step="0.01" value={budgetForm.original_po_amount} onChange={(e) => setBudgetForm((f) => ({ ...f, original_po_amount: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Hours Billed</label>
              <input type="number" step="0.1" value={budgetForm.prior_hours_billed} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_hours_billed: e.target.value }))} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Amount Spent ($)</label>
              <input type="number" step="0.01" value={budgetForm.prior_amount_spent} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_amount_spent: e.target.value }))} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Period Notes</label>
              <input type="text" value={budgetForm.prior_period_notes} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_period_notes: e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Orders</span>
                <button type="button" onClick={addChangeOrder} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {budgetForm.changeOrders.map((co, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <input type="text" value={co.co_number} onChange={(e) => updateChangeOrder(idx, 'co_number', e.target.value)} placeholder="CO #" className="flex-1 min-w-[80px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                    <input type="date" value={co.co_date} onChange={(e) => updateChangeOrder(idx, 'co_date', e.target.value)} className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                    <input type="number" step="0.01" value={co.amount} onChange={(e) => updateChangeOrder(idx, 'amount', e.target.value)} placeholder="Amount" className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                    <button type="button" onClick={() => removeChangeOrder(idx)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Remove"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={saveBudget} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditingBudget(false)} disabled={saving} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-right py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2">Original PO</td>
                <td className="text-right py-2">${originalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              {changeOrders.map((co: any, idx: number) => (
                <tr key={co.id || `co-${idx}`} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">Change Order {co.co_number || ''} ({co.co_date ? formatDate(co.co_date) : ''})</td>
                  <td className="text-right py-2">${(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                <td className="py-2">Total Available</td>
                <td className="text-right py-2">${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              {priorAmountSpent > 0 && (
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 text-amber-700 dark:text-amber-300">Prior period spent (before this system)</td>
                  <td className="text-right py-2 text-amber-700 dark:text-amber-300">-${priorAmountSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 3. Invoice history */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invoice History</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Invoices are entered by Admin. Running balance populates PO Balance in the PO popup.</p>
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setInvoiceModal({})} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Add Invoice
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Invoice #</th>
              <th className="text-left py-2 font-medium">Period</th>
              <th className="text-left py-2 font-medium">Payment Received</th>
              <th className="text-right py-2 font-medium">Amount</th>
              {isAdmin && <th className="w-20 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className="py-4 text-center text-gray-500">No invoices yet</td></tr>
            ) : (
              invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{inv.invoice_date ? formatDate(inv.invoice_date) : '—'}</td>
                  <td className="py-2">{inv.invoice_number || '—'}</td>
                  <td className="py-2">{inv.period_month}/{inv.period_year}</td>
                  <td className="py-2">{inv.payment_received_date ? formatDate(inv.payment_received_date) : '—'}</td>
                  <td className="text-right py-2">${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  {isAdmin && (
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setInvoiceModal(inv)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={async () => { if (confirm('Delete this invoice?')) { await fetch(`/api/budget/${po.id}/invoices/${inv.id}`, { method: 'DELETE' }); refetch() } }} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
            <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
              <td colSpan={isAdmin ? 5 : 4} className="py-2">Total Invoiced</td>
              <td className="text-right py-2">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            {priorAmountSpent > 0 && (
              <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                <td colSpan={isAdmin ? 5 : 4} className="py-2 text-amber-700 dark:text-amber-300">Prior period spent (before this system)</td>
                <td className="text-right py-2 text-amber-700 dark:text-amber-300">${priorAmountSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            )}
            <tr className="font-semibold bg-green-50 dark:bg-green-900/20">
              <td colSpan={isAdmin ? 5 : 4} className="py-2">Running Balance (PO Balance)</td>
              <td className="text-right py-2">${runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. Budget Balance */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Budget Balance</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Based on actual labor (rates × hours). Differs from PO Balance when invoicing is scheduled or fixed amounts—PO Balance reflects invoices; Budget Balance reflects earned value from timesheets.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600">
              <th className="text-left py-2 font-medium">Description</th>
              <th className="text-right py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2">Total Available</td>
              <td className="text-right py-2">${(totalBudget - priorAmountSpent).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2">Labor cost (rates × hours from timesheets)</td>
              <td className="text-right py-2">-${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr className="font-semibold bg-blue-50 dark:bg-blue-900/20">
              <td className="py-2">Budget Balance</td>
              <td className="text-right py-2">${budgetBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 5. Billable activities table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Activities (from Timesheets)</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Month:</label>
            <select
              value={selectedMonth.split('-')[1]}
              onChange={(e) => setSelectedMonth(`${selectedMonth.split('-')[0]}-${e.target.value}`)}
              disabled={showAllMonths}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <option key={m} value={String(m).padStart(2, '0')}>
                  {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
            <label className="text-sm font-medium">Year:</label>
            <select
              value={selectedMonth.split('-')[0]}
              onChange={(e) => setSelectedMonth(`${e.target.value}-${selectedMonth.split('-')[1]}`)}
              disabled={showAllMonths}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllMonths}
              onChange={(e) => setShowAllMonths(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">View all months</span>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 font-medium sticky left-0 bg-white dark:bg-gray-800">
                  <button type="button" onClick={() => handleBillableSort('employee')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                    Employee{billableSortIcon('employee')}
                  </button>
                </th>
                {weekEndings.map((we: string) => (
                  <th key={we} className="text-right py-2 font-medium whitespace-nowrap">
                    <button type="button" onClick={() => handleBillableSort(we)} className="inline-flex items-center justify-end w-full hover:text-gray-700 dark:hover:text-gray-200">
                      {formatDateShort(we)}{billableSortIcon(we)}
                    </button>
                  </th>
                ))}
                <th className="text-right py-2 font-medium">
                  <button type="button" onClick={() => handleBillableSort('total')} className="inline-flex items-center justify-end w-full hover:text-gray-700 dark:hover:text-gray-200">
                    Total{billableSortIcon('total')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {priorHoursBilled > 0 && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                  <td className="py-2 sticky left-0 bg-amber-50/50 dark:bg-amber-900/10">
                    <span className="font-medium text-amber-800 dark:text-amber-200">Prior period (manual)</span>
                    {poData.prior_period_notes && (
                      <span className="block text-xs text-amber-600 dark:text-amber-300 mt-0.5">{poData.prior_period_notes}</span>
                    )}
                  </td>
                  {weekEndings.map((we: string) => (
                    <td key={we} className="text-right py-2 text-amber-700 dark:text-amber-300">—</td>
                  ))}
                  <td className="text-right py-2 font-medium text-amber-700 dark:text-amber-300">{priorHoursBilled.toFixed(1)}</td>
                </tr>
              )}
              {rows.length === 0 && priorHoursBilled === 0 ? (
                <tr><td colSpan={weekEndings.length + 2} className="py-4 text-center text-gray-500">No billable hours for this period</td></tr>
              ) : sortedRows.length > 0 ? (
                sortedRows.map((r: any) => (
                  <tr
                    key={r.userId}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="py-2 sticky left-0 bg-white dark:bg-gray-800">
                      <button
                        type="button"
                        onClick={() => setEmployeePopup(r)}
                        className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {r.userName}
                      </button>
                    </td>
                    {weekEndings.map((we: string) => (
                      <td key={we} className="text-right py-2">
                        <button
                          type="button"
                          onClick={() => setEmployeePopup(r)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {(r.weekData[we]?.hours || 0).toFixed(1)}
                        </button>
                      </td>
                    ))}
                    <td className="text-right py-2 font-medium">{r.rowTotal.toFixed(1)}</td>
                  </tr>
                ))
              ) : null}
              {(rows.length > 0 || priorHoursBilled > 0) && (
                <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                  <td className="py-2 sticky left-0 bg-gray-50 dark:bg-gray-700/50">Total</td>
                  {weekEndings.map((we: string) => (
                    <td key={we} className="text-right py-2">{columnTotals[we]?.toFixed(1) || '0.0'}</td>
                  ))}
                  <td className="text-right py-2">{grandTotal.toFixed(1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Additional expenses */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Additional Expenses</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Travel, equipment, mileage, etc.</p>
          </div>
          <button type="button" onClick={() => setExpenseModal({})} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Expense
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Type</th>
              <th className="text-left py-2 font-medium">Notes</th>
              <th className="text-right py-2 font-medium">Amount</th>
              <th className="w-20 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-gray-500">No additional expenses</td></tr>
            ) : (
              expenses.map((ex: any) => (
                <tr key={ex.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{ex.expense_date ? formatDate(ex.expense_date) : '—'}</td>
                  <td className="py-2">{ex.po_expense_types?.name || ex.custom_type_name || 'Custom'}</td>
                  <td className="py-2">{ex.notes || '—'}</td>
                  <td className="text-right py-2">${(ex.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setExpenseModal(ex)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => { if (confirm('Delete this expense?')) { await fetch(`/api/budget/${po.id}/expenses/${ex.id}`, { method: 'DELETE' }); refetch() } }} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Bill rates */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bill Rates by Person</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rates can change over time; effective date indicates when each rate applies.</p>
          </div>
          <button type="button" onClick={() => setBillRateModal({})} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Bill Rate
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600">
              <th className="text-left py-2 font-medium">Employee</th>
              <th className="text-left py-2 font-medium">Effective From</th>
              <th className="text-right py-2 font-medium">Rate ($/hr)</th>
              <th className="w-20 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {billRates.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-gray-500">No bill rates defined</td></tr>
            ) : (
              billRates.map((br: any) => (
                <tr key={br.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">{br.user_profiles?.name || 'Unknown'}</td>
                  <td className="py-2">{br.effective_from_date ? formatDate(br.effective_from_date) : '—'}</td>
                  <td className="text-right py-2">${(br.rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setBillRateModal(br)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => { if (confirm('Delete this bill rate?')) { await fetch(`/api/budget/${po.id}/bill-rates/${br.id}`, { method: 'DELETE' }); refetch() } }} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {invoiceModal && (
        <InvoiceFormModal
          poId={po.id}
          invoice={invoiceModal.id ? invoiceModal : undefined}
          onSave={refetch}
          onClose={() => setInvoiceModal(null)}
        />
      )}
      {expenseModal && (
        <ExpenseFormModal
          poId={po.id}
          expense={expenseModal.id ? expenseModal : undefined}
          expenseTypes={expenseTypes}
          onSave={refetch}
          onClose={() => setExpenseModal(null)}
        />
      )}
      {billRateModal && (
        <BillRateFormModal
          poId={po.id}
          rate={billRateModal.id ? billRateModal : undefined}
          users={users}
          onSave={refetch}
          onClose={() => setBillRateModal(null)}
        />
      )}

      {/* Employee drill-down popup */}
      {employeePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEmployeePopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{employeePopup.userName}</h3>
              <button type="button" onClick={() => setEmployeePopup(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Week endings with hours billed to this PO:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(employeePopup.weekData)
                .filter(([, d]) => d.hours > 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([we, d]) => (
                  <div key={we} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-700">
                    <span>{formatDate(we)}</span>
                    <span className="font-medium">{d.hours.toFixed(1)} hrs</span>
                    {d.timesheetId && (
                      <Link
                        href={`/dashboard/timesheets/${d.timesheetId}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-sm shrink-0"
                      >
                        View timesheet <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setEmployeePopup(null)}
              className="mt-4 w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
