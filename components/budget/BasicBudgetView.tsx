'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X, Upload, FileText, Eye, PowerOff } from 'lucide-react'
import {
  formatDate,
  formatDateShort,
  formatPeriodsList,
  formatDateForInput,
  formatHours,
  normalizePoIssueDateToIso,
  formatPoIssueDateForDisplay,
} from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { addWeeks, parseISO } from 'date-fns'
import InvoiceFormModal from './InvoiceFormModal'
import ExpenseFormModal from './ExpenseFormModal'
import BillRateFormModal from './BillRateFormModal'

const ATTACHMENT_ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx']

/** YYYY-MM-DD for <input type="date"> — handles ISO strings, DB date strings, avoids empty edit field when co_date exists */
function coDateForInput(v: unknown): string {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

interface BasicBudgetViewProps {
  po: any
  sites?: Array<{ id: string; name?: string; address_street?: string; address_city?: string; address_state?: string; address_zip?: string; contact?: string }>
  onBack: () => void
  user?: { id: string; profile: { role: string } }
  hasLimitedAccess?: boolean
  /** For navigation: sites, POs for current site, and callbacks. Access already filtered by parent. */
  allSites?: Array<{ id: string; name?: string }>
  sitePOs?: Array<{ id: string; po_number: string; site_id: string; description?: string; departments?: { name: string } }>
  selectedSiteId?: string
  selectedPoId?: string
  onSelectSite?: (siteId: string) => void
  onSelectPo?: (poId: string) => void
  onPrev?: () => void
  onNext?: () => void
  onSave?: () => void
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
  onSave,
  hasLimitedAccess = false,
}: BasicBudgetViewProps) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<any>(null)
  const [changeOrdersOverride, setChangeOrdersOverride] = useState<any[] | null>(null)
  const [invoicesOverride, setInvoicesOverride] = useState<any[] | null>(null)
  const [expensesOverride, setExpensesOverride] = useState<any[] | null>(null)
  const [billRatesOverride, setBillRatesOverride] = useState<any[] | null>(null)
  const [billableData, setBillableData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showAllMonths, setShowAllMonths] = useState(false)
  const [employeePopup, setEmployeePopup] = useState<{ userId: string; userName: string; weekData: Record<string, { hours: number; timesheetId: string }>; mode: 'hours' | 'cost' } | null>(null)
  const [invoiceDetailPopup, setInvoiceDetailPopup] = useState<any>(null)
  const [invoiceModal, setInvoiceModal] = useState<any>(null)
  const [expenseModal, setExpenseModal] = useState<any>(null)
  const [billRateModal, setBillRateModal] = useState<any>(null)
  const [billableSortColumn, setBillableSortColumn] = useState<string>('employee')
  const [billableSortDir, setBillableSortDir] = useState<'asc' | 'desc'>('asc')
  const [laborCostData, setLaborCostData] = useState<any>(null)
  const [budgetAccessUsers, setBudgetAccessUsers] = useState<Array<{ id: string; name: string }>>([])
  const [budgetAccessModal, setBudgetAccessModal] = useState<'add' | null>(null)
  const [balanceData, setBalanceData] = useState<{
    budgetBalance: number
    lastTimesheetWe: string | null
    totalAvailable?: number
    personnelLineItems?: Array<{ user_id: string; userName: string; allocated: number; spent: number; remaining: number }>
  } | null>(null)
  const [budgetHealthForm, setBudgetHealthForm] = useState({ weekly_burn: '', target_end_date: '' })
  const [weeklyBurnFocused, setWeeklyBurnFocused] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string }>>([])
  const [editingClientPO, setEditingClientPO] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [expenseTypesFallback, setExpenseTypesFallback] = useState<Array<{ id: string; name: string }>>([])
  const [clientPOForm, setClientPOForm] = useState({
    po_number: '',
    department_id: '',
    project_name: '',
    po_issue_date: '',
    proposal_number: '',
    client_contact_name: '',
    budget_type: 'basic' as 'basic' | 'project',
    net_terms: '',
    how_to_bill: '',
  })
  const [budgetForm, setBudgetForm] = useState<{
    original_po_amount: string
    prior_hours_billed: string
    prior_hours_billed_rate: string
    prior_amount_spent: string
    prior_period_notes: string
    changeOrders: Array<{
      id?: string
      type: 'co' | 'li'
      line_item_type?: 'personnel' | 'labor'
      user_id?: string
      co_number: string
      co_date: string
      amount: string
    }>
  }>({
    original_po_amount: '',
    prior_hours_billed: '',
    prior_hours_billed_rate: '',
    prior_amount_spent: '',
    prior_period_notes: '',
    changeOrders: [],
  })

  const fetchOpts: RequestInit = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }

  const loadBudgetAccess = useCallback(async () => {
    if (!user || !['admin', 'super_admin'].includes(user.profile.role)) return
    try {
      const res = await fetch(`/api/budget/${po.id}/budget-access`, fetchOpts)
      if (res.ok) {
        const json = await res.json()
        setBudgetAccessUsers(json.users || [])
      }
    } catch { /* ignore */ }
  }, [po.id, user])

  const loadBalance = useCallback(async () => {
    if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) return
    try {
      const res = await fetch(`/api/budget/${po.id}/balance`, fetchOpts)
      if (res.ok) {
        const json = await res.json()
        setBalanceData({
          budgetBalance: json.budgetBalance ?? 0,
          lastTimesheetWe: json.lastTimesheetWe ?? null,
          totalAvailable: json.totalAvailable,
          personnelLineItems: json.personnelLineItems ?? [],
        })
      }
    } catch { /* ignore */ }
  }, [po.id, user])

  const loadExpenses = useCallback(async () => {
    try {
      const t = `t=${Date.now()}`
      const res = await fetch(`/api/budget/${po.id}/expenses?${t}`, { ...fetchOpts, credentials: 'include' })
      if (res.ok) {
        const expenses = await res.json()
        setData((prev: any) => prev ? { ...prev, expenses: Array.isArray(expenses) ? expenses : prev.expenses } : prev)
      }
    } catch { /* ignore */ }
    setExpensesOverride(null)
  }, [po.id])

  const refetch = useCallback(async () => {
    const t = `t=${Date.now()}`
    const [res, coRes, invRes, brRes, laborRes] = await Promise.all([
      fetch(`/api/budget/${po.id}?${t}`, fetchOpts),
      fetch(`/api/budget/${po.id}/change-orders?${t}`, fetchOpts),
      fetch(`/api/budget/${po.id}/invoices?${t}`, fetchOpts),
      fetch(`/api/budget/${po.id}/bill-rates?${t}`, fetchOpts),
      fetch(`/api/budget/${po.id}/billable-hours?all=true&${t}`, fetchOpts),
    ])
    if (res.ok) {
      const json = await res.json()
      setData(json)
      setExpensesOverride(null)
    }
    if (coRes.ok) {
      const json = await coRes.json()
      setChangeOrdersOverride(Array.isArray(json) ? json : [])
    } else setChangeOrdersOverride(null)
    if (invRes.ok) {
      const json = await invRes.json()
      setInvoicesOverride(Array.isArray(json) ? json : [])
    } else setInvoicesOverride(null)
    if (brRes.ok) {
      const json = await brRes.json()
      setBillRatesOverride(Array.isArray(json) ? json : null)
    } else setBillRatesOverride(null)
    if (laborRes.ok) setLaborCostData(await laborRes.json())
    loadBudgetAccess()
    if (user && ['manager', 'admin', 'super_admin'].includes(user.profile.role)) loadBalance()
  }, [po.id, loadBudgetAccess, loadBalance, user])

  useEffect(() => {
    setExpenseTypesFallback([])
    setExpensesOverride(null)
  }, [po.id])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const t = `t=${Date.now()}`
      try {
        const [res, bhRes, coRes, invRes, brRes, laborRes] = await Promise.all([
          fetch(`/api/budget/${po.id}?${t}`, fetchOpts),
          fetch(`/api/budget/${po.id}/billable-hours?${showAllMonths ? 'all=true' : `month=${selectedMonth.split('-')[1]}&year=${selectedMonth.split('-')[0]}`}&${t}`, fetchOpts),
          fetch(`/api/budget/${po.id}/change-orders?${t}`, fetchOpts),
          fetch(`/api/budget/${po.id}/invoices?${t}`, fetchOpts),
          fetch(`/api/budget/${po.id}/bill-rates?${t}`, fetchOpts),
          fetch(`/api/budget/${po.id}/billable-hours?all=true&${t}`, fetchOpts),
        ])
        if (res.ok) setData(await res.json())
        if (bhRes.ok) setBillableData(await bhRes.json())
        if (coRes.ok) {
          const json = await coRes.json()
          setChangeOrdersOverride(Array.isArray(json) ? json : [])
        } else setChangeOrdersOverride(null)
        if (invRes.ok) {
          const json = await invRes.json()
          setInvoicesOverride(Array.isArray(json) ? json : [])
        } else setInvoicesOverride(null)
        if (brRes.ok) {
          const json = await brRes.json()
          setBillRatesOverride(Array.isArray(json) ? json : null)
        } else setBillRatesOverride(null)
        if (laborRes.ok) setLaborCostData(await laborRes.json())
        if (user && ['admin', 'super_admin'].includes(user.profile.role)) {
          const accRes = await fetch(`/api/budget/${po.id}/budget-access`, fetchOpts)
          if (accRes.ok) {
            const accJson = await accRes.json()
            setBudgetAccessUsers(accJson.users || [])
          }
        }
        const balRes = await fetch(`/api/budget/${po.id}/balance`, fetchOpts)
        if (balRes.ok) {
          const balJson = await balRes.json()
          setBalanceData({ budgetBalance: balJson.budgetBalance ?? 0, lastTimesheetWe: balJson.lastTimesheetWe ?? null })
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [po.id, selectedMonth, showAllMonths, user])

  useEffect(() => {
    const p = data?.po ?? po
    if (p) {
      setBudgetHealthForm({
        weekly_burn: p.weekly_burn != null ? String(p.weekly_burn) : '',
        target_end_date: p.target_end_date ? formatDateForInput(p.target_end_date) : '',
      })
    }
  }, [data?.po, po])

  // Fallback: when budget API returns empty expense types or expenses, fetch from dedicated APIs
  useEffect(() => {
    if (!data || !po?.id) return
    const fromBudget = data?.expenseTypes || []
    if (fromBudget.length > 0) {
      setExpenseTypesFallback([])
      return
    }
    fetch('/api/expense-types', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then((res) => res.ok ? res.json() : [])
      .then((arr) => setExpenseTypesFallback(Array.isArray(arr) ? arr : []))
      .catch(() => setExpenseTypesFallback([]))
    if ((data?.expenses?.length ?? 0) === 0) {
      loadExpenses()
    }
  }, [data, po?.id, loadExpenses])

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
  // Prefer change orders from the main /api/budget GET (authoritative). The separate /change-orders fetch
  // must NOT override that — it caused stale/incomplete rows (e.g. missing co_date) to replace fresh data.
  const changeOrders =
    data != null && Array.isArray(data.changeOrders) ? data.changeOrders : (changeOrdersOverride ?? [])
  const invoices = invoicesOverride !== null ? invoicesOverride : (data?.invoices || [])
  const usersFromApi = data?.users || []
  const usersFromBillable = (billableData?.rows || []).map((r: any) => ({ id: r.userId, name: r.userName }))
  const usersMap = new Map<string, { id: string; name: string }>()
  usersFromApi.forEach((u: { id: string; name: string }) => usersMap.set(u.id, u))
  usersFromBillable.forEach((u: { id: string; name: string }) => usersMap.set(u.id, u))
  const users = Array.from(usersMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const billRatesRaw = billRatesOverride !== null ? billRatesOverride : (data?.billRates || [])
  const billRates = billRatesRaw
    .map((br: any) => ({
      ...br,
      user_profiles: br.user_profiles ?? (br.user_id ? { id: br.user_id, name: users.find((u: any) => u.id === br.user_id)?.name || 'Unknown' } : null),
    }))
    .sort((a: any, b: any) => (a.user_profiles?.name || 'Unknown').localeCompare(b.user_profiles?.name || 'Unknown'))
  const expenses = expensesOverride !== null ? expensesOverride : (data?.expenses || [])
  const attachments = data?.attachments || []
  const expenseTypesFromData = data?.expenseTypes || []
  const expenseTypes = expenseTypesFromData.length > 0 ? expenseTypesFromData : expenseTypesFallback
  const siteDepartmentsRaw = (data?.siteDepartments || []) as Array<{ id: string; name: string }>
  const siteDepartments = poData.department_id && poData.departments && !siteDepartmentsRaw.some((d) => d.id === poData.department_id)
    ? [{ id: poData.department_id, name: poData.departments.name || 'Unknown' }, ...siteDepartmentsRaw]
    : siteDepartmentsRaw
  const isAdmin = user && ['admin', 'super_admin'].includes(user.profile.role)
  const canEdit = user && ['manager', 'admin', 'super_admin'].includes(user.profile.role) && !hasLimitedAccess

  const originalBudget = poData.original_po_amount ?? 0
  const coTotal = changeOrders.filter((c: any) => (c.type || 'co') === 'co').reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const liTotal = changeOrders.filter((c: any) => c.type === 'li').reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const totalBudget = originalBudget + coTotal + liTotal
  const priorAmountSpent = poData.prior_amount_spent ?? 0
  const priorHoursBilled = poData.prior_hours_billed ?? 0
  const priorHoursBilledRate = poData.prior_hours_billed_rate ?? 0
  const priorCostFromHours = priorHoursBilled * priorHoursBilledRate
  const invoiceTotal = invoices.reduce((s: number, inv: any) => s + (inv.amount || 0), 0)
  const hasAnyNotes = invoices.some((inv: any) => inv.notes && String(inv.notes).trim() !== '')
  const runningBalance = totalBudget - invoiceTotal

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

  const budgetBalanceComputed = totalBudget - priorAmountSpent - priorCostFromHours - laborCost
  const budgetBalance = balanceData?.budgetBalance ?? budgetBalanceComputed

  const rows = billableData?.rows || []
  const weekEndings = billableData?.weekEndings || []
  const columnTotals = billableData?.columnTotals || {}
  const grandTotalFromTimesheets = billableData?.grandTotal || 0
  const grandTotal = grandTotalFromTimesheets + priorHoursBilled
  const displayColumnTotals = hasLimitedAccess && user
    ? Object.fromEntries(
        Object.entries(columnTotals).map(([we, tot]) => [we, rows.find((r: any) => r.userId === user.id)?.weekData?.[we]?.hours ?? 0])
      )
    : columnTotals
  const displayGrandTotal = hasLimitedAccess && user
    ? (rows.find((r: any) => r.userId === user.id)?.rowTotal ?? 0)
    : grandTotal

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
  const filteredRows = hasLimitedAccess && user ? rows.filter((r: any) => r.userId === user.id) : rows
  const sortedRows = [...filteredRows].sort((a: any, b: any) => {
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
      po_issue_date: normalizePoIssueDateToIso(poData.po_issue_date),
      proposal_number: poData.proposal_number || '',
      client_contact_name: poData.client_contact_name || '',
      budget_type: (poData.budget_type || 'basic') as 'basic' | 'project',
      net_terms: poData.net_terms || '',
      how_to_bill: poData.how_to_bill || '',
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
        credentials: 'include',
        body: JSON.stringify({
          ...clientPOForm,
          po_issue_date: normalizePoIssueDateToIso(clientPOForm.po_issue_date) || null,
        }),
      })
      const text = await res.text()
      let json: { error?: string }
      try {
        json = JSON.parse(text)
      } catch {
        if (text.startsWith('<')) {
          setSaveError(`Server returned an error page (${res.status}). Please refresh and try again, or contact support if it persists.`)
          return
        }
        throw new Error('Invalid response from server')
      }
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setEditingClientPO(false)
      window.location.reload()
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
      prior_hours_billed_rate: poData.prior_hours_billed_rate != null ? String(poData.prior_hours_billed_rate) : '',
      prior_amount_spent: poData.prior_amount_spent != null ? String(poData.prior_amount_spent) : '',
      prior_period_notes: poData.prior_period_notes || '',
      changeOrders: changeOrders.map((co: any) => ({
        id: co.id,
        type: co.type === 'li' ? 'li' : 'co',
        line_item_type: co.line_item_type === 'personnel' ? 'personnel' : co.line_item_type === 'labor' ? 'labor' : undefined,
        user_id: co.user_id ?? undefined,
        co_number: co.co_number || '',
        co_date: coDateForInput(co.co_date),
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
      // Always send co_date as a string (never omit the key): JSON.stringify drops undefined values,
      // which made the API treat the date as missing and save null.
      const changeOrdersPayload = budgetForm.changeOrders.map((co) => {
        const raw = co.co_date
        const coDateStr =
          typeof raw === 'string'
            ? raw.trim().slice(0, 10)
            : raw != null && raw !== ''
              ? String(raw).trim().slice(0, 10)
              : ''
        return {
          id: co.id,
          type: co.type ?? 'co',
          line_item_type: co.line_item_type,
          user_id: co.user_id,
          co_number: co.co_number ?? '',
          co_date: coDateStr,
          amount: co.amount ?? '',
        }
      })
      const res = await fetch(`/api/budget/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_po_amount: budgetForm.original_po_amount,
          prior_hours_billed: budgetForm.prior_hours_billed,
          prior_hours_billed_rate: budgetForm.prior_hours_billed_rate,
          prior_amount_spent: budgetForm.prior_amount_spent,
          prior_period_notes: budgetForm.prior_period_notes,
          changeOrders: changeOrdersPayload,
        }),
      })
      const text = await res.text()
      let json: { error?: string }
      try {
        json = JSON.parse(text)
      } catch {
        if (text.startsWith('<')) {
          setSaveError(`Server returned an error page (${res.status}). Please refresh and try again, or contact support if it persists.`)
          return
        }
        throw new Error('Invalid response from server')
      }
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setEditingBudget(false)
      window.location.reload()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addChangeOrder = () => setBudgetForm((f) => ({
    ...f,
    changeOrders: [...f.changeOrders, { type: 'co' as const, co_number: '', co_date: '', amount: '' }],
  }))
  const removeChangeOrder = (idx: number) => setBudgetForm((f) => ({
    ...f,
    changeOrders: f.changeOrders.filter((_, i) => i !== idx),
  }))
  const updateChangeOrder = (idx: number, field: string, value: string | undefined) => setBudgetForm((f) => {
    const next = [...f.changeOrders]
    const row = { ...next[idx] }
    if (field === 'type') {
      row.type = value === 'li' ? 'li' : 'co'
      if (row.type === 'co') {
        row.line_item_type = undefined
        row.user_id = undefined
      } else {
        row.line_item_type = row.line_item_type || 'personnel'
      }
    } else if (field === 'line_item_type') {
      row.line_item_type = value === 'personnel' ? 'personnel' : value === 'labor' ? 'labor' : undefined
      if (row.line_item_type !== 'personnel') row.user_id = undefined
    } else if (field === 'user_id') {
      row.user_id = value || undefined
    } else {
      ;(row as any)[field] = value ?? ''
    }
    next[idx] = row
    return { ...f, changeOrders: next }
  })

  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-base'

  const isActive = po?.active !== false

  const handleActiveToggle = async () => {
    if (isActive && !confirm('Deactivate this PO? It will no longer appear in timesheet dropdowns.')) return
    setDeactivating(true)
    try {
      const res = await fetch(`/api/budget/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !isActive }),
      })
      if (res.ok) {
        onSave?.()
        window.location.reload()
      }
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to budget list
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={handleActiveToggle}
            disabled={deactivating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
          >
            <PowerOff className="h-4 w-4" />
            {deactivating ? '…' : isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </div>

      {/* Navigation: prev | Client + PO dropdowns | next — above container. On mobile, dropdowns stack so arrows fit properly. */}
      {(allSites.length > 0 || sitePOs.length > 0) && (
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent shrink-0"
            title="Previous PO"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-1 flex-col sm:flex-row justify-center gap-2 sm:gap-2 items-stretch sm:items-end min-w-0">
            {allSites.length > 0 && onSelectSite && (
              <div className="w-full sm:min-w-[140px] sm:flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Client</label>
                <select
                  value={selectedSiteId || poData.site_id || ''}
                  onChange={(e) => onSelectSite(e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select client --</option>
                  {allSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || 'Unknown'}</option>
                  ))}
                </select>
              </div>
            )}
            {sitePOs.length > 0 && onSelectPo && (
              <div className="w-full sm:min-w-[200px] sm:flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">PO</label>
                <select
                  value={selectedPoId || po.id}
                  onChange={(e) => onSelectPo(e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent shrink-0"
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
            <div className="space-y-4">
              <div>
                <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Client / Site</p>
                <p className="text-gray-900 dark:text-gray-100">{site.name}</p>
                {addressParts.length > 0 && <p className="text-gray-600 dark:text-gray-300 mt-1 text-sm">{addressParts.join(', ')}</p>}
                {site.contact && <p className="text-gray-600 dark:text-gray-300 text-sm">{site.contact}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Client Contact Name</label>
                <input type="text" value={clientPOForm.client_contact_name} onChange={(e) => setClientPOForm((f) => ({ ...f, client_contact_name: e.target.value }))} className={inputClass} placeholder="—" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Budget Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="budget_type" value="basic" checked={clientPOForm.budget_type === 'basic'} onChange={(e) => setClientPOForm((f) => ({ ...f, budget_type: e.target.value as 'basic' | 'project' }))} className="rounded-full" />
                    <span>Basic</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="budget_type" value="project" checked={clientPOForm.budget_type === 'project'} onChange={(e) => setClientPOForm((f) => ({ ...f, budget_type: e.target.value as 'basic' | 'project' }))} className="rounded-full" />
                    <span>Project</span>
                  </label>
                </div>
              </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Net Terms</label>
                <input type="text" value={clientPOForm.net_terms} onChange={(e) => setClientPOForm((f) => ({ ...f, net_terms: e.target.value }))} className={inputClass} placeholder="e.g. Net 30" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">How to Bill</label>
                <input type="text" value={clientPOForm.how_to_bill} onChange={(e) => setClientPOForm((f) => ({ ...f, how_to_bill: e.target.value }))} className={inputClass} placeholder="e.g. Ariba, Fieldglass, Email" />
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
              <p className="font-medium text-gray-500 dark:text-gray-400 mt-4">Client Contact</p>
              <p className="text-gray-900 dark:text-gray-100">{poData.client_contact_name || '—'}</p>
              <p className="font-medium text-gray-500 dark:text-gray-400 mt-4">Budget Type</p>
              <p className="text-gray-900 dark:text-gray-100 capitalize">{poData.budget_type || 'basic'}</p>
            </div>
            <div className="space-y-2">
              <p><span className="font-medium text-gray-500 dark:text-gray-400">PO#:</span> {poData.po_number}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Department:</span> {poData.departments?.name || '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Project:</span> {poData.description ?? poData.project_name ?? '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">PO Issue Date:</span> {formatPoIssueDateForDisplay(poData.po_issue_date)}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Proposal #:</span> {poData.proposal_number || '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Net Terms:</span> {poData.net_terms || '—'}</p>
              <p><span className="font-medium text-gray-500 dark:text-gray-400">How to Bill:</span> {poData.how_to_bill || '—'}</p>
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Attachments</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Word, Excel, or PDF files</p>
          {attachmentError && (
            <div className="mb-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{attachmentError}</div>
          )}
          {canEdit && (
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 text-sm mb-3">
              <Upload className="h-4 w-4" />
              {uploadingAttachment ? 'Uploading...' : '+ PO / + Proposal'}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                className="hidden"
                disabled={uploadingAttachment}
                onChange={async (e) => {
                  const files = e.target.files
                  if (!files?.length) return
                  setAttachmentError(null)
                  setUploadingAttachment(true)
                  try {
                    const uploadOne = async (file: File) => {
                      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
                      if (!ATTACHMENT_ALLOWED_EXT.includes(ext)) {
                        throw new Error('File type not allowed. Use Word, Excel, or PDF.')
                      }
                      const path = `po_attachments/${po.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
                      const { error: uploadErr } = await supabase.storage.from('site-attachments').upload(path, file, { upsert: false })
                      if (uploadErr) throw uploadErr
                      const { data: inserted, error: insertErr } = await supabase
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
                      if (insertErr) {
                        await supabase.storage.from('site-attachments').remove([path]).catch(() => {})
                        throw insertErr
                      }
                      return inserted
                    }
                    const uploadOneViaApi = async (file: File) => {
                      const formData = new FormData()
                      formData.append('file', file)
                      const res = await fetch(`/api/budget/${po.id}/attachments`, {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error((err as { error?: string }).error || 'Upload failed')
                      }
                      return res.json()
                    }
                    for (const file of Array.from(files)) {
                      let inserted: { id?: string } | null = null
                      try {
                        inserted = await uploadOne(file)
                      } catch {
                        inserted = await uploadOneViaApi(file)
                      }
                      if (inserted?.id) {
                        setData((prev: any) =>
                          prev
                            ? {
                                ...prev,
                                attachments: [...(prev.attachments || []), inserted],
                              }
                            : prev
                        )
                      }
                    }
                    await refetch()
                  } catch (err: any) {
                    setAttachmentError(err.message || 'Upload failed')
                    void refetch()
                  } finally {
                    setUploadingAttachment(false)
                    e.target.value = ''
                  }
                }}
              />
            </label>
          )}
          <div className="space-y-2">
            {attachments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No attachments</p>
            ) : (
              attachments.map((att: any) => (
                <div key={att.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/budget/${po.id}/attachments/${att.id}/download`, fetchOpts)
                      if (res.ok) {
                        const { url } = await res.json()
                        window.open(url)
                      }
                    }}
                    className="flex items-center gap-2 text-left hover:text-blue-600 dark:hover:text-blue-400 min-w-0 flex-1"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{att.file_name}</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this attachment?')) return
                        setAttachmentError(null)
                        const res = await fetch(`/api/budget/${po.id}/attachments/${att.id}`, { method: 'DELETE' })
                        if (res.ok) refetch()
                        else setAttachmentError('Delete failed')
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded shrink-0"
                      title="Delete attachment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 1b. Budget Access (left, admin only) + Budget Health (right, anyone with access) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Budget Access — left, admin only */}
        {isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Budget Access</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Grant access to this PO budget for users with a profile.</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setBudgetAccessModal('add')
                  try {
                    const res = await fetch(`/api/budget/${po.id}/budget-access?available=1`, fetchOpts)
                    if (res.ok) {
                      const json = await res.json()
                      setAvailableUsers(json.users || [])
                    }
                  } catch { setAvailableUsers([]) }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Grant Access
              </button>
            </div>
            <div className="space-y-2">
              {budgetAccessUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No users granted access yet.</p>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                  {budgetAccessUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2">
                      <span className="text-gray-900 dark:text-gray-100">{u.name}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Revoke budget access for ${u.name}?`)) return
                          await fetch(`/api/budget/${po.id}/budget-access?userId=${u.id}`, { method: 'DELETE', ...fetchOpts })
                          loadBudgetAccess()
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Revoke access"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {budgetAccessModal === 'add' && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBudgetAccessModal(null)}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Grant Budget Access</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Select a user to grant access to this PO budget:</p>
                  <select
                    id="budget-access-user-select"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4"
                  >
                    <option value="">— Select user —</option>
                    {availableUsers
                      .filter((u) => !budgetAccessUsers.some((a) => a.id === u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </select>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setBudgetAccessModal(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const sel = document.getElementById('budget-access-user-select') as HTMLSelectElement
                        const userId = sel?.value
                        if (!userId) return
                        const res = await fetch(`/api/budget/${po.id}/budget-access`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId }),
                          ...fetchOpts,
                        })
                        if (res.ok) {
                          setBudgetAccessModal(null)
                          loadBudgetAccess()
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                    >
                      Grant Access
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Budget Health — right, visible to anyone with budget access */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Budget Health</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Weekly burn ($/week)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={weeklyBurnFocused ? budgetHealthForm.weekly_burn : (() => {
                      const num = parseFloat(budgetHealthForm.weekly_burn)
                      return !isNaN(num) ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : budgetHealthForm.weekly_burn
                    })()}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '')
                      const parts = raw.split('.')
                      const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw
                      setBudgetHealthForm((f) => ({ ...f, weekly_burn: sanitized }))
                    }}
                    onFocus={() => setWeeklyBurnFocused(true)}
                    onBlur={async () => {
                      setWeeklyBurnFocused(false)
                      if (!canEdit) return
                      const val = budgetHealthForm.weekly_burn === '' ? null : parseFloat(budgetHealthForm.weekly_burn)
                      if (val === (poData.weekly_burn ?? null) || (val != null && isNaN(val))) return
                      try {
                        const res = await fetch(`/api/budget/${po.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ weekly_burn: val }),
                          ...fetchOpts,
                        })
                        if (res.ok) refetch()
                      } catch { /* ignore */ }
                    }}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Last Timesheet WE</label>
                <p className="text-sm text-gray-900 dark:text-gray-100 py-2">
                  {balanceData?.lastTimesheetWe ? formatDate(balanceData.lastTimesheetWe) : '—'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Auto: most recent approved timesheet week ending for this PO.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Target End Date</label>
                <input
                  type="date"
                  value={budgetHealthForm.target_end_date}
                  onChange={(e) => setBudgetHealthForm((f) => ({ ...f, target_end_date: e.target.value }))}
                  onBlur={async () => {
                    if (!canEdit) return
                    const val = budgetHealthForm.target_end_date || null
                    if (val === (poData.target_end_date ? formatDateForInput(poData.target_end_date) : null)) return
                    try {
                      const res = await fetch(`/api/budget/${po.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_end_date: val }),
                        ...fetchOpts,
                      })
                      if (res.ok) refetch()
                    } catch { /* ignore */ }
                  }}
                  className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Estimated Budget End Date</label>
                {(() => {
                  const bb = balanceData?.budgetBalance ?? budgetBalance
                  const burn = parseFloat(budgetHealthForm.weekly_burn)
                  const lastWe = balanceData?.lastTimesheetWe
                  if (!lastWe || !(burn > 0) || bb <= 0) {
                    return <p className="text-sm text-gray-900 dark:text-gray-100 py-2">—</p>
                  }
                  const weeksRemaining = bb / burn
                  const estDate = addWeeks(parseISO(lastWe), weeksRemaining)
                  return <p className="text-sm text-gray-900 dark:text-gray-100 py-2">{formatDate(estDate)}</p>
                })()}
                <p className="text-xs text-gray-500 dark:text-gray-400">Auto: Last Timesheet WE + (Budget Balance ÷ Weekly burn) weeks.</p>
              </div>
            </div>
          </div>
        </div>

      {/* 2. Budget table (original + change orders) — hidden for limited access */}
      {!hasLimitedAccess && (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Original PO Amount ($)</label>
                <input type="number" step="0.01" value={budgetForm.original_po_amount} onChange={(e) => setBudgetForm((f) => ({ ...f, original_po_amount: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Hours Billed</label>
                <input type="number" step="0.1" value={budgetForm.prior_hours_billed} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_hours_billed: e.target.value }))} className={inputClass} placeholder="0" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Hours billed before this system. Reduces Budget Balance.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Hours Bill Rate ($/hr)</label>
                <input type="number" step="0.01" value={budgetForm.prior_hours_billed_rate} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_hours_billed_rate: e.target.value }))} className={inputClass} placeholder="0" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rate to use for prior hours. Cost = hours × rate.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Amount Spent ($)</label>
                <input type="number" step="0.01" value={budgetForm.prior_amount_spent} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_amount_spent: e.target.value }))} className={inputClass} placeholder="0" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Other prior spend (non-labor). Reduces Budget Balance only, not PO Balance.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prior Period Notes</label>
                <input type="text" value={budgetForm.prior_period_notes} onChange={(e) => setBudgetForm((f) => ({ ...f, prior_period_notes: e.target.value }))} className={inputClass} placeholder="Optional" />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Change Orders / Line Items</span>
                <button type="button" onClick={addChangeOrder} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">CO = Change Order, LI = Line Item (both add funds). Checkbox: checked = LI.</p>
              <div className="space-y-2">
                {budgetForm.changeOrders.map((co, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <label className="flex items-center gap-1 shrink-0 text-sm">
                      <input type="checkbox" checked={co.type === 'li'} onChange={(e) => updateChangeOrder(idx, 'type', e.target.checked ? 'li' : 'co')} className="rounded" />
                      <span>{co.type === 'li' ? 'LI' : 'CO'}</span>
                    </label>
                    {co.type === 'li' && (
                      <>
                        <label className="flex items-center gap-1 shrink-0 text-sm">
                          <input type="radio" name={`li-type-${idx}`} checked={co.line_item_type === 'personnel'} onChange={() => updateChangeOrder(idx, 'line_item_type', 'personnel')} />
                          <span>Personnel</span>
                        </label>
                        <label className="flex items-center gap-1 shrink-0 text-sm">
                          <input type="radio" name={`li-type-${idx}`} checked={co.line_item_type === 'labor'} onChange={() => updateChangeOrder(idx, 'line_item_type', 'labor')} />
                          <span>Labor</span>
                        </label>
                        {co.line_item_type === 'personnel' ? (
                          <select value={co.user_id || ''} onChange={(e) => updateChangeOrder(idx, 'user_id', e.target.value || undefined)} className="min-w-[140px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                            <option value="">Select employee</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        ) : co.line_item_type === 'labor' ? (
                          <input type="text" value={co.co_number} onChange={(e) => updateChangeOrder(idx, 'co_number', e.target.value)} placeholder="Description" className="flex-1 min-w-[100px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                        ) : null}
                      </>
                    )}
                    {co.type === 'co' && (
                      <input type="text" value={co.co_number} onChange={(e) => updateChangeOrder(idx, 'co_number', e.target.value)} placeholder="CO #" className="flex-1 min-w-[80px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                    )}
                    <input
                      type="date"
                      value={co.co_date ?? ''}
                      onChange={(e) => updateChangeOrder(idx, 'co_date', e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0"
                    />
                    <input type="number" step="0.01" value={co.amount} onChange={(e) => updateChangeOrder(idx, 'amount', e.target.value)} placeholder="Amount" className="w-24 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm" />
                    <button type="button" onClick={() => removeChangeOrder(idx)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded shrink-0" title="Remove"><Trash2 className="h-4 w-4" /></button>
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
              {changeOrders.map((co: any, idx: number) => {
                const isLI = co.type === 'li'
                const dateSuffix = co.co_date ? ` (${formatDate(co.co_date)})` : ''
                const label = isLI
                  ? (co.line_item_type === 'personnel'
                    ? `Line Item (Personnel: ${users.find((u: any) => u.id === co.user_id)?.name ?? 'Unknown'})${dateSuffix}`
                    : `Line Item (Labor: ${co.co_number || '—'})${dateSuffix}`)
                  : `Change Order ${co.co_number || ''}${dateSuffix}`
                return (
                  <tr key={co.id || `co-${idx}`} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2">{label}</td>
                    <td className="text-right py-2">${(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                )
              })}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                <td className="py-2">Total Available</td>
                <td className="text-right py-2">${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* 3. Invoice history — hidden for limited access */}
      {!hasLimitedAccess && (
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
        {/* Mobile: condensed table */}
        <div className="md:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 px-2 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Invoice #</th>
                <th className="w-14 py-2 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">No invoices yet</td></tr>
              ) : (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-2">{inv.invoice_date ? formatDate(inv.invoice_date) : '—'}</td>
                    <td className="py-2 px-2 break-words">{inv.invoice_number || '—'}</td>
                    <td className="py-2 px-1">
                      <button type="button" onClick={() => setInvoiceDetailPopup(inv)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="View details"><Eye className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))
              )}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50"><td colSpan={2} className="py-2 px-2">Total Invoiced</td><td className="text-right py-2 px-2 font-medium">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              <tr className="font-semibold bg-green-50 dark:bg-green-900/20"><td colSpan={2} className="py-2 px-2">Running Balance</td><td className="text-right py-2 px-2 font-medium">${runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
            </tbody>
          </table>
        </div>
        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 px-3 font-medium min-w-[110px]">Date</th>
                <th className="text-left py-2 px-3 font-medium min-w-[120px]">Invoice #</th>
                <th className="text-left py-2 px-3 font-medium min-w-[95px]">Period</th>
                <th className="text-left py-2 px-3 font-medium min-w-[130px]">Payment Received</th>
                <th className="text-right py-2 px-3 font-medium min-w-[100px]">Amount</th>
                {hasAnyNotes && <th className="text-left py-2 px-3 font-medium min-w-[140px]">Notes</th>}
                {isAdmin && <th className="w-20 py-2 px-2"></th>}
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={(isAdmin ? 1 : 0) + (hasAnyNotes ? 6 : 5)} className="py-4 text-center text-gray-500">No invoices yet</td></tr>
              ) : (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-3">{inv.invoice_date ? formatDate(inv.invoice_date) : '—'}</td>
                    <td className="py-2 px-3">{inv.invoice_number || '—'}</td>
                    <td className="py-2 px-3">{formatPeriodsList(inv.periods?.length ? inv.periods : (inv.period_month != null && inv.period_year != null ? [{ month: inv.period_month, year: inv.period_year }] : []))}</td>
                    <td className="py-2 px-3">{inv.payment_received_date ? formatDate(inv.payment_received_date) : '—'}</td>
                    <td className="text-right py-2 px-3">${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    {hasAnyNotes && <td className="py-2 px-3 min-w-0 break-words align-top">{inv.notes || '—'}</td>}
                    {isAdmin && (
                      <td className="py-2 px-2">
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
                <td colSpan={(hasAnyNotes ? 5 : 4) + (isAdmin ? 1 : 0)} className="py-2 px-3">Total Invoiced</td>
                <td className="text-right py-2 px-3">${invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr className="font-semibold bg-green-50 dark:bg-green-900/20">
                <td colSpan={(hasAnyNotes ? 5 : 4) + (isAdmin ? 1 : 0)} className="py-2 px-3">Running Balance (PO Balance)</td>
                <td className="text-right py-2 px-3">${runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 4. Budget Balance — hidden for limited access */}
      {!hasLimitedAccess && (
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
              <td className="py-2">Total Available (from PO + COs + LIs)</td>
              <td className="text-right py-2">${(balanceData?.totalAvailable ?? totalBudget).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            {(balanceData?.personnelLineItems?.length ?? 0) > 0 && (balanceData?.personnelLineItems ?? []).map((pli: { user_id: string; userName: string; allocated: number; spent: number; remaining: number }) => (
              <tr key={pli.user_id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2 pl-4 text-gray-600 dark:text-gray-400">Personnel LI: {pli.userName} (remaining)</td>
                <td className="text-right py-2">${pli.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {(priorAmountSpent > 0 || priorCostFromHours > 0) && (
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-2 text-amber-700 dark:text-amber-300">Prior period (before this system)</td>
                <td className="text-right py-2 text-amber-700 dark:text-amber-300">-${(priorAmountSpent + priorCostFromHours).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            )}
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
      )}

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
        {/* Mobile: condensed table */}
        <div className="md:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 px-2 font-medium">Employee</th>
                <th className="w-14 py-2 px-1"></th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {priorHoursBilled > 0 && !hasLimitedAccess && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                  <td className="py-2 px-2 break-words"><span className="font-medium text-amber-800 dark:text-amber-200">Prior period (manual)</span></td>
                  <td className="py-2 px-1"></td>
                  <td className="text-right py-2 px-2 font-medium text-amber-700 dark:text-amber-300">{formatHours(priorHoursBilled)}</td>
                </tr>
              )}
              {sortedRows.length === 0 && priorHoursBilled === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">No billable hours for this period</td></tr>
              ) : sortedRows.map((r: any) => (
                <tr key={r.userId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2 break-words"><span className="font-medium">{r.userName}</span></td>
                  <td className="py-2 px-1"><button type="button" onClick={() => setEmployeePopup({ ...r, mode: 'hours' as const })} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="View hours by week"><Eye className="h-4 w-4" /></button></td>
                  <td className="text-right py-2 px-2 font-medium">{formatHours(r.rowTotal)}</td>
                </tr>
              ))}
              {(rows.length > 0 || priorHoursBilled > 0) && (
                <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                  <td className="py-2 px-2">Total</td>
                  <td className="py-2 px-1"></td>
                  <td className="text-right py-2 px-2">{formatHours(displayGrandTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
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
              {priorHoursBilled > 0 && !hasLimitedAccess && (
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
                  <td className="text-right py-2 font-medium text-amber-700 dark:text-amber-300">{formatHours(priorHoursBilled)}</td>
                </tr>
              )}
              {(rows.length === 0 && priorHoursBilled === 0) || (hasLimitedAccess && sortedRows.length === 0) ? (
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
                        onClick={() => setEmployeePopup({ ...r, mode: 'hours' })}
                        className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {r.userName}
                      </button>
                    </td>
                    {weekEndings.map((we: string) => (
                      <td key={we} className="text-right py-2">
                        <button
                          type="button"
                          onClick={() => setEmployeePopup({ ...r, mode: 'hours' })}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {formatHours(r.weekData[we]?.hours)}
                        </button>
                      </td>
                    ))}
                    <td className="text-right py-2 font-medium">{formatHours(r.rowTotal)}</td>
                  </tr>
                ))
              ) : null}
              {(rows.length > 0 || priorHoursBilled > 0) && (
                <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                  <td className="py-2 sticky left-0 bg-gray-50 dark:bg-gray-700/50">Total</td>
                  {weekEndings.map((we: string) => (
                    <td key={we} className="text-right py-2">{formatHours(displayColumnTotals[we])}</td>
                  ))}
                  <td className="text-right py-2">{formatHours(displayGrandTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5b. Billable cost table (hours × rate) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Cost (from Timesheets)</h2>
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
        {/* Mobile: condensed table */}
        <div className="md:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 px-2 font-medium">Employee</th>
                <th className="w-14 py-2 px-1"></th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {priorHoursBilled > 0 && !hasLimitedAccess && (
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                  <td className="py-2 px-2 break-words"><span className="font-medium text-amber-800 dark:text-amber-200">Prior period (manual)</span></td>
                  <td className="py-2 px-1"></td>
                  <td className="text-right py-2 px-2 font-medium text-amber-700 dark:text-amber-300">{(priorHoursBilled * priorHoursBilledRate) === 0 ? '—' : `$${(priorHoursBilled * priorHoursBilledRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                </tr>
              )}
              {sortedRows.length === 0 && priorHoursBilled === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">No billable cost for this period</td></tr>
              ) : sortedRows.map((r: any) => {
                const rowCostTotal = weekEndings.reduce((sum: number, we: string) => {
                  const hours = r.weekData?.[we]?.hours ?? 0
                  return sum + hours * getEffectiveRate(r.userId, we)
                }, 0)
                return (
                  <tr key={r.userId} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-2 break-words"><span className="font-medium">{r.userName}</span></td>
                    <td className="py-2 px-1"><button type="button" onClick={() => setEmployeePopup({ ...r, mode: 'cost' as const })} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="View cost by week"><Eye className="h-4 w-4" /></button></td>
                    <td className="text-right py-2 px-2 font-medium">{rowCostTotal === 0 ? '—' : `$${rowCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                  </tr>
                )
              })}
              {(rows.length > 0 || priorHoursBilled > 0) && (
                <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                  <td className="py-2 px-2">Total</td>
                  <td className="py-2 px-1"></td>
                  <td className="text-right py-2 px-2">{(() => {
                    const costColumnTotals: Record<string, number> = {}
                    for (const we of weekEndings) {
                      costColumnTotals[we] = sortedRows.reduce((sum: number, r: any) => {
                        const hours = r.weekData?.[we]?.hours ?? 0
                        const rate = getEffectiveRate(r.userId, we)
                        return sum + hours * rate
                      }, 0)
                    }
                    const tot = Object.values(costColumnTotals).reduce((a, b) => a + b, 0) + priorCostFromHours
                    return tot === 0 ? '—' : `$${tot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  })()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Desktop: full table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 font-medium sticky left-0 bg-white dark:bg-gray-800">Employee</th>
                {weekEndings.map((we: string) => (
                  <th key={we} className="text-right py-2 font-medium whitespace-nowrap">{formatDateShort(we)}</th>
                ))}
                <th className="text-right py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {priorHoursBilled > 0 && !hasLimitedAccess && (
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
                  <td className="text-right py-2 font-medium text-amber-700 dark:text-amber-300">
                    {(priorHoursBilled * priorHoursBilledRate) === 0 ? '—' : `$${(priorHoursBilled * priorHoursBilledRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                </tr>
              )}
              {rows.length === 0 && priorHoursBilled === 0 ? (
                <tr><td colSpan={weekEndings.length + 2} className="py-4 text-center text-gray-500">No billable cost for this period</td></tr>
              ) : sortedRows.length > 0 ? (
                sortedRows.map((r: any) => {
                  let rowCostTotal = 0
                  const costCells = weekEndings.map((we: string) => {
                    const hours = r.weekData?.[we]?.hours ?? 0
                    const rate = getEffectiveRate(r.userId, we)
                    const cost = hours * rate
                    rowCostTotal += cost
                    return cost
                  })
                  return (
                    <tr key={r.userId} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2 sticky left-0 bg-white dark:bg-gray-800">
                        <button
                          type="button"
                          onClick={() => setEmployeePopup({ ...r, mode: 'cost' })}
                          className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {r.userName}
                        </button>
                      </td>
                      {costCells.map((cost: number, i: number) => (
                        <td key={weekEndings[i]} className="text-right py-2">
                          {cost === 0 ? '—' : `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>
                      ))}
                      <td className="text-right py-2 font-medium">{rowCostTotal === 0 ? '—' : `$${rowCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                    </tr>
                  )
                })
              ) : null}
              {(rows.length > 0 || priorHoursBilled > 0) && (() => {
                const costColumnTotals: Record<string, number> = {}
                for (const we of weekEndings) {
                  costColumnTotals[we] = sortedRows.reduce((sum: number, r: any) => {
                    const hours = r.weekData?.[we]?.hours ?? 0
                    const rate = getEffectiveRate(r.userId, we)
                    return sum + hours * rate
                  }, 0)
                }
                const costGrandTotal = Object.values(costColumnTotals).reduce((a, b) => a + b, 0) + priorCostFromHours
                return (
                  <tr className="font-semibold bg-gray-50 dark:bg-gray-700/50">
                    <td className="py-2 sticky left-0 bg-gray-50 dark:bg-gray-700/50">Total</td>
                    {weekEndings.map((we: string) => (
                      <td key={we} className="text-right py-2">{(costColumnTotals[we] || 0) === 0 ? '—' : `$${(costColumnTotals[we] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                    ))}
                    <td className="text-right py-2">{costGrandTotal === 0 ? '—' : `$${costGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Additional expenses — hidden for limited access */}
      {!hasLimitedAccess && (
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
                  <td className="py-2">{(ex.expense_type_id && expenseTypes.find((t: any) => t.id === ex.expense_type_id)?.name) || ex.custom_type_name || 'Custom'}</td>
                  <td className="py-2">{ex.notes || '—'}</td>
                  <td className="text-right py-2">${(ex.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setExpenseModal(ex)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => { if (confirm('Delete this expense?')) { await fetch(`/api/budget/${po.id}/expenses/${ex.id}`, { method: 'DELETE' }); loadExpenses() } }} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* 7. Bill rates — hidden for limited access */}
      {!hasLimitedAccess && (
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
      )}

      {invoiceModal && (
        <InvoiceFormModal
          key={invoiceModal?.id ?? 'new'}
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
          onSave={loadExpenses}
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

      {/* Invoice detail popup (mobile) */}
      {invoiceDetailPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setInvoiceDetailPopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invoice Details</h3>
              <button type="button" onClick={() => setInvoiceDetailPopup(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400">Date:</span> {invoiceDetailPopup.invoice_date ? formatDate(invoiceDetailPopup.invoice_date) : '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Invoice #:</span> {invoiceDetailPopup.invoice_number || '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Period:</span> {formatPeriodsList(invoiceDetailPopup.periods?.length ? invoiceDetailPopup.periods : (invoiceDetailPopup.period_month != null && invoiceDetailPopup.period_year != null ? [{ month: invoiceDetailPopup.period_month, year: invoiceDetailPopup.period_year }] : []))}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Payment Received:</span> {invoiceDetailPopup.payment_received_date ? formatDate(invoiceDetailPopup.payment_received_date) : '—'}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Amount:</span> ${(invoiceDetailPopup.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              {hasAnyNotes && <div><span className="text-gray-500 dark:text-gray-400">Notes:</span> {invoiceDetailPopup.notes || '—'}</div>}
            </div>
            {isAdmin && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <button type="button" onClick={() => { setInvoiceModal(invoiceDetailPopup); setInvoiceDetailPopup(null) }} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium">Edit</button>
                <button type="button" onClick={async () => { if (confirm('Delete this invoice?')) { await fetch(`/api/budget/${po.id}/invoices/${invoiceDetailPopup.id}`, { method: 'DELETE' }); refetch(); setInvoiceDetailPopup(null) } }} className="py-2 px-4 text-red-600 border border-red-300 dark:border-red-700 rounded-lg font-medium">Delete</button>
              </div>
            )}
            <button type="button" onClick={() => setInvoiceDetailPopup(null)} className="mt-4 w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium">Close</button>
          </div>
        </div>
      )}

      {/* Employee drill-down popup */}
      {employeePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEmployeePopup(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{employeePopup.userName}</h3>
              <button type="button" onClick={() => setEmployeePopup(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{(employeePopup.mode || 'hours') === 'cost' ? 'Week endings with cost:' : 'Week endings with hours:'}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {weekEndings
                .map((we: string) => {
                  const d = employeePopup.weekData?.[we]
                  const hours = d?.hours ?? 0
                  const cost = employeePopup.userId && employeePopup.userId !== '_prior' ? hours * getEffectiveRate(employeePopup.userId, we) : 0
                  return { we, hours, cost, timesheetId: d?.timesheetId }
                })
                .map(({ we, hours, cost, timesheetId }: { we: string; hours: number; cost: number; timesheetId?: string }) => (
                  <div key={we} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-700">
                    <span>{formatDate(we)}</span>
                    <span className="font-medium">
                      {(employeePopup.mode || 'hours') === 'cost' ? (cost === 0 ? '—' : `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) : (hours === 0 ? '—' : `${formatHours(hours)} hrs`)}
                    </span>
                    {timesheetId && (employeePopup.mode || 'hours') === 'hours' && (
                      <Link
                        href={`/dashboard/timesheets/${timesheetId}`}
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
