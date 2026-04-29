'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { Upload, Plus, Trash2, X, FileSpreadsheet, Search, Info, Download, Layers, Eye, Users } from 'lucide-react'
import { decodeIndirectNotes, effectiveIndirectTreatAs, encodeIndirectNotes, indirectLineDollarTotal } from '@/lib/bid-sheet-indirect'

interface Item {
  id: string
  bid_sheet_system_id: string
  bid_sheet_deliverable_id: string
  bid_sheet_activity_id: string
  budgeted_hours: number
  labor_id?: string | null
  bid_sheet_systems?: { id: string; name: string; code?: string }
  bid_sheet_deliverables?: { id: string; name: string; description?: string | null }
  bid_sheet_activities?: { id: string; name: string; description?: string | null }
}

interface Labor {
  id: string
  user_id?: string
  placeholder_name?: string
  bid_rate: number
  notes?: string
  user_profiles?: { id: string; name: string }
}

interface IndirectLabor {
  id: string
  category: string
  hours: number
  rate: number
  notes?: string
}

/** Local typing state before debounced save (avoids API round-trips overwriting fast input). */
type IndirectFieldDraft = {
  hours?: string
  rate?: string
  label?: string
  contVal?: string
  /**
   * Single dollar amount used for expense-style indirect lines (Travel &
   * Living, plus Additional / Custom rows toggled to Expense). Stored on
   * the row as hours=1 / rate=<amount> so hours × rate continues to equal
   * the amount and indirectLineDollarTotal / convert / sync logic don't have
   * to special-case the expense path.
   */
  amount?: string
}

function parseIndirectDraftNum(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback
  const t = s.trim()
  if (t === '' || t === '.') return 0
  const p = parseFloat(t)
  return Number.isFinite(p) ? p : fallback
}

const INDIRECT_CATEGORIES = [
  { id: 'project_management', label: 'Project Management' },
  { id: 'document_coordinator', label: 'Document Coordinator' },
  { id: 'project_controls', label: 'Project Controls' },
  { id: 'travel_living_project', label: 'Travel & Living (Project by Person)' },
  { id: 'travel_living_fat', label: 'Travel & Living (FAT)' },
  { id: 'additional_indirect', label: 'Additional Indirect Costs' },
] as const

const ROW_HEIGHT_NORMAL = 80
const ROW_HEIGHT_COMPACT = 60

const cellKey = (systemId: string, deliverableId: string, activityId: string) =>
  `${systemId}\t${deliverableId}\t${activityId}`

export default function BidSheetDetailClient({
  sheet,
  items: initialItems,
  labor: initialLabor,
  indirectLabor: initialIndirect,
  systems,
  deliverables,
  activities,
  departments,
  user,
  readOnly = false,
  linkedPo = null,
}: {
  sheet: any
  items: Item[]
  labor: Labor[]
  indirectLabor: IndirectLabor[]
  systems: Array<{ id: string; name: string; code?: string; description?: string | null }>
  deliverables: Array<{ id: string; name: string; description?: string | null }>
  activities: Array<{ id: string; name: string; description?: string | null }>
  departments?: Array<{ id: string; name: string }>
  user: { id: string; profile: { role: string } }
  readOnly?: boolean
  /** Present when the bid sheet is converted; used for project $ on this page */
  linkedPo?: { id: string; original_po_amount: number | null; po_balance: number | null } | null
}) {
  const depts = departments ?? []
  const [items, setItems] = useState(initialItems)
  const [labor, setLabor] = useState(initialLabor)
  const [indirectLabor, setIndirectLabor] = useState(initialIndirect)
  const [indirectDrafts, setIndirectDrafts] = useState<Record<string, IndirectFieldDraft>>({})
  const indirectLaborRef = useRef(initialIndirect)
  const indirectDraftsRef = useRef<Record<string, IndirectFieldDraft>>({})
  const indirectDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const indirectPersistSeq = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    indirectLaborRef.current = indirectLabor
  }, [indirectLabor])
  useEffect(() => {
    indirectDraftsRef.current = indirectDrafts
  }, [indirectDrafts])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<{
    inserted: number
    skipped: number
    skippedRows: Array<{ line: number; row: string; reason: string; hours: number }>
    merged: number
    csvRowCount: number
    csvHoursTotal: number
    importedHoursTotal: number
  } | null>(null)
  const [showAddLabor, setShowAddLabor] = useState(false)
  const [laborUserId, setLaborUserId] = useState('')
  const [laborPlaceholderFirst, setLaborPlaceholderFirst] = useState('')
  const [laborPlaceholderLast, setLaborPlaceholderLast] = useState('')
  const [laborUsePlaceholder, setLaborUsePlaceholder] = useState(false)
  const [laborRate, setLaborRate] = useState('')
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convertModal, setConvertModal] = useState(false)
  const [convertPoNumber, setConvertPoNumber] = useState('')
  const [convertProjectName, setConvertProjectName] = useState(sheet.name || '')
  const [convertDepartmentId, setConvertDepartmentId] = useState('')
  const [systemSearch, setSystemSearch] = useState('')
  // Filter the matrix to rows where at least one cell is assigned to this
  // labor row. Empty string = "all resources". Stored as the labor.id.
  const [laborFilter, setLaborFilter] = useState('')
  const [compactMode, setCompactMode] = useState(false)
  const [viewRow, setViewRow] = useState<{ systemId: string; activityId: string; systemName: string; activityName: string } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const canEdit = !readOnly && ['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)
  const canEditBidStructure =
    canEdit && (sheet.status === 'draft' || sheet.status === 'converted')
  const bidSheetId = sheet.id

  const [poAmountInput, setPoAmountInput] = useState(() =>
    linkedPo?.original_po_amount != null ? String(linkedPo.original_po_amount) : ''
  )
  const [linkedPoBalance, setLinkedPoBalance] = useState<number | null>(linkedPo?.po_balance ?? null)

  useEffect(() => {
    setPoAmountInput(linkedPo?.original_po_amount != null ? String(linkedPo.original_po_amount) : '')
    setLinkedPoBalance(linkedPo?.po_balance ?? null)
  }, [linkedPo?.id, linkedPo?.original_po_amount, linkedPo?.po_balance])

  // Add system / deliverable / activity
  const [showAddSystem, setShowAddSystem] = useState(false)
  const [showAddDeliverable, setShowAddDeliverable] = useState(false)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [addSystemName, setAddSystemName] = useState('')
  const [addSystemCode, setAddSystemCode] = useState('')
  const [addDeliverableName, setAddDeliverableName] = useState('')
  const [addActivityName, setAddActivityName] = useState('')
  const [addDeliverableDescription, setAddDeliverableDescription] = useState('')
  const [addActivityDescription, setAddActivityDescription] = useState('')
  const [addSystemDescription, setAddSystemDescription] = useState('')
  const [editingDeliverable, setEditingDeliverable] = useState<{ id: string; name: string; description?: string | null } | null>(null)
  const [editingActivity, setEditingActivity] = useState<{ id: string; name: string; description?: string | null } | null>(null)
  const [editDelName, setEditDelName] = useState('')
  const [editDelDesc, setEditDelDesc] = useState('')
  const [editActName, setEditActName] = useState('')
  const [editActDesc, setEditActDesc] = useState('')
  const [hourDrafts, setHourDrafts] = useState<Record<string, string>>({})
  const [editingSystem, setEditingSystem] = useState<{ id: string; name: string; code?: string | null; description?: string | null } | null>(null)
  const [editSysName, setEditSysName] = useState('')
  const [editSysCode, setEditSysCode] = useState('')
  const [editSysDesc, setEditSysDesc] = useState('')
  const hourDraftsRef = useRef<Record<string, string>>({})
  const hoursDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const hoursSaveGen = useRef<Map<string, number>>(new Map())

  // Bid sheet access (grant/revoke)
  const [accessUsers, setAccessUsers] = useState<Array<{ id: string; name: string }>>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [showGrantAccess, setShowGrantAccess] = useState(false)
  const [grantUserId, setGrantUserId] = useState('')
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string }>>([])

  const fetchAccessUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/access`)
      if (res.ok) {
        const json = await res.json()
        setAccessUsers(json.users || [])
      }
    } catch {
      setAccessUsers([])
    }
  }, [bidSheetId])

  useEffect(() => {
    if (canEdit) fetchAccessUsers()
  }, [canEdit, fetchAccessUsers])

  const handleGrantAccess = async () => {
    if (!grantUserId) return
    setAccessLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: grantUserId }),
      })
      if (res.ok) {
        setGrantUserId('')
        setShowGrantAccess(false)
        fetchAccessUsers()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to grant access')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to grant access')
    } finally {
      setAccessLoading(false)
    }
  }

  const handleRevokeAccess = async (userId: string) => {
    if (!confirm('Revoke this user\'s access to the bid sheet?')) return
    setAccessLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/access?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      if (res.ok) fetchAccessUsers()
      else {
        const data = await res.json()
        setError(data.error || 'Failed to revoke access')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to revoke access')
    } finally {
      setAccessLoading(false)
    }
  }

  const getItemHours = useCallback((systemId: string, deliverableId: string, activityId: string) => {
    const item = items.find((i) => i.bid_sheet_system_id === systemId && i.bid_sheet_deliverable_id === deliverableId && i.bid_sheet_activity_id === activityId)
    return item?.budgeted_hours ?? 0
  }, [items])

  const getItemLaborId = useCallback((systemId: string, deliverableId: string, activityId: string) => {
    const item = items.find((i) => i.bid_sheet_system_id === systemId && i.bid_sheet_deliverable_id === deliverableId && i.bid_sheet_activity_id === activityId)
    return item?.labor_id ?? null
  }, [items])

  const getItemCost = useCallback((systemId: string, deliverableId: string, activityId: string) => {
    const item = items.find((i) => i.bid_sheet_system_id === systemId && i.bid_sheet_deliverable_id === deliverableId && i.bid_sheet_activity_id === activityId)
    const hrs = item?.budgeted_hours ?? 0
    const laborId = item?.labor_id
    const lab = laborId ? labor.find((l) => l.id === laborId) : null
    const rate = lab?.bid_rate ?? 0
    return hrs * rate
  }, [items, labor])

  const persistItemCell = useCallback(
    async (
      systemId: string,
      deliverableId: string,
      activityId: string,
      hours: number,
      laborId: string | null,
      opts?: { generation?: number; key?: string }
    ) => {
      if (!canEdit) return
      setError(null)
      try {
        const res = await fetch(`/api/bid-sheets/${bidSheetId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bid_sheet_system_id: systemId,
            bid_sheet_deliverable_id: deliverableId,
            bid_sheet_activity_id: activityId,
            budgeted_hours: hours,
            labor_id: laborId || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        const k = opts?.key ?? cellKey(systemId, deliverableId, activityId)
        if (opts?.generation !== undefined && hoursSaveGen.current.get(k) !== opts.generation) {
          return
        }
        setItems((prev) => {
          const rest = prev.filter(
            (i) =>
              !(
                i.bid_sheet_system_id === systemId &&
                i.bid_sheet_deliverable_id === deliverableId &&
                i.bid_sheet_activity_id === activityId
              )
          )
          return [
            ...rest,
            {
              ...data,
              bid_sheet_systems: systems.find((s) => s.id === systemId),
              bid_sheet_deliverables: deliverables.find((d) => d.id === deliverableId),
              bid_sheet_activities: activities.find((a) => a.id === activityId),
            },
          ]
        })
        if (opts?.generation !== undefined) {
          setHourDrafts((prev) => {
            const next = { ...prev }
            delete next[k]
            return next
          })
          delete hourDraftsRef.current[k]
        }
      } catch (e: any) {
        setError(e.message)
      }
    },
    [bidSheetId, canEdit, systems, deliverables, activities]
  )

  const scheduleHoursSave = useCallback(
    (systemId: string, deliverableId: string, activityId: string, laborId: string | null) => {
      const key = cellKey(systemId, deliverableId, activityId)
      const prev = hoursDebounceTimers.current.get(key)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        hoursDebounceTimers.current.delete(key)
        if (!Object.prototype.hasOwnProperty.call(hourDraftsRef.current, key)) return
        const raw = hourDraftsRef.current[key]
        const trimmed = (raw ?? '').trim()
        const hours = trimmed === '' || trimmed === '.' ? 0 : parseFloat(trimmed)
        const h = Number.isFinite(hours) ? hours : 0
        const gen = (hoursSaveGen.current.get(key) ?? 0) + 1
        hoursSaveGen.current.set(key, gen)
        void persistItemCell(systemId, deliverableId, activityId, h, laborId, { generation: gen, key })
      }, 400)
      hoursDebounceTimers.current.set(key, t)
    },
    [persistItemCell]
  )

  const flushHoursOnBlur = useCallback(
    (systemId: string, deliverableId: string, activityId: string, laborId: string | null) => {
      const key = cellKey(systemId, deliverableId, activityId)
      const prev = hoursDebounceTimers.current.get(key)
      if (prev) clearTimeout(prev)
      hoursDebounceTimers.current.delete(key)
      if (!Object.prototype.hasOwnProperty.call(hourDraftsRef.current, key)) return
      const raw = hourDraftsRef.current[key]
      const trimmed = (raw ?? '').trim()
      const hours = trimmed === '' || trimmed === '.' ? 0 : parseFloat(trimmed)
      const h = Number.isFinite(hours) ? hours : 0
      const gen = (hoursSaveGen.current.get(key) ?? 0) + 1
      hoursSaveGen.current.set(key, gen)
      void persistItemCell(systemId, deliverableId, activityId, h, laborId, { generation: gen, key })
    },
    [persistItemCell]
  )

  const onLaborCellChange = useCallback(
    (systemId: string, deliverableId: string, activityId: string, laborId: string | null) => {
      const key = cellKey(systemId, deliverableId, activityId)
      const prevT = hoursDebounceTimers.current.get(key)
      if (prevT) clearTimeout(prevT)
      hoursDebounceTimers.current.delete(key)
      const raw = hourDraftsRef.current[key]
      const hrs =
        raw !== undefined
          ? (() => {
              const t = raw.trim()
              if (t === '' || t === '.') return 0
              const p = parseFloat(t)
              return Number.isFinite(p) ? p : 0
            })()
          : getItemHours(systemId, deliverableId, activityId)
      void persistItemCell(systemId, deliverableId, activityId, hrs, laborId, { key })
    },
    [persistItemCell, getItemHours]
  )

  useEffect(() => {
    return () => {
      hoursDebounceTimers.current.forEach((timer) => clearTimeout(timer))
      hoursDebounceTimers.current.clear()
    }
  }, [])

  useEffect(() => {
    return () => {
      indirectDebounceTimers.current.forEach((timer) => clearTimeout(timer))
      indirectDebounceTimers.current.clear()
    }
  }, [])

  useEffect(() => {
    if (canEdit && bidSheetId) {
      fetch(`/api/bid-sheets/${bidSheetId}/users`)
        .then((r) => r.ok ? r.json() : [])
        .then((d: any) => setUsers(Array.isArray(d) ? d : (d?.users || [])))
        .catch(() => {})
    }
  }, [canEdit, bidSheetId])

  const systemActivityRows = useMemo(() =>
    systems.flatMap((sys) =>
      activities.map((act) => ({ systemId: sys.id, systemName: sys.name, systemCode: sys.code, activityId: act.id, activityName: act.name }))
    ),
    [systems, activities]
  )

  const filteredRows = useMemo(() => {
    const q = systemSearch.trim().toLowerCase()
    const hasSearch = q.length > 0
    const hasLaborFilter = !!laborFilter
    if (!hasSearch && !hasLaborFilter) return systemActivityRows
    return systemActivityRows.filter((row) => {
      if (hasSearch) {
        const nameMatch = (row.systemName || '').toLowerCase().includes(q)
        const codeMatch = (row.systemCode || '').toLowerCase().includes(q)
        if (!nameMatch && !codeMatch) return false
      }
      if (hasLaborFilter) {
        // Keep this (system, activity) row only if at least one deliverable
        // cell on the row is assigned to the selected labor entry.
        const hasAssigned = deliverables.some(
          (d) => getItemLaborId(row.systemId, d.id, row.activityId) === laborFilter
        )
        if (!hasAssigned) return false
      }
      return true
    })
  }, [systemActivityRows, systemSearch, laborFilter, deliverables, getItemLaborId])

  const getEffectiveHours = useCallback(
    (systemId: string, deliverableId: string, activityId: string) => {
      const k = cellKey(systemId, deliverableId, activityId)
      const draft = hourDrafts[k]
      if (draft !== undefined) {
        const t = draft.trim()
        if (t === '' || t === '.') return 0
        const p = parseFloat(t)
        return Number.isFinite(p) ? p : 0
      }
      return getItemHours(systemId, deliverableId, activityId)
    },
    [hourDrafts, getItemHours]
  )

  const matrixAggregates = useMemo(() => {
    const columnCosts: Record<string, number> = {}
    for (const d of deliverables) columnCosts[d.id] = 0
    let matrixGrandCost = 0
    let footerTotalHours = 0
    const rowCostByKey = new Map<string, number>()

    for (const row of filteredRows) {
      const rk = `${row.systemId}-${row.activityId}`
      let rowC = 0
      let rowH = 0
      for (const d of deliverables) {
        const hrs = getEffectiveHours(row.systemId, d.id, row.activityId)
        const laborId = getItemLaborId(row.systemId, d.id, row.activityId)
        const lab = laborId ? labor.find((l) => l.id === laborId) : null
        const c = hrs * (lab?.bid_rate ?? 0)
        rowC += c
        rowH += hrs
        columnCosts[d.id] = (columnCosts[d.id] || 0) + c
      }
      rowCostByKey.set(rk, rowC)
      footerTotalHours += rowH
      matrixGrandCost += rowC
    }
    return { columnCosts, matrixGrandCost, footerTotalHours, rowCostByKey }
  }, [filteredRows, deliverables, getEffectiveHours, getItemLaborId, labor])

  const totalBudgetedHours = useMemo(() => {
    let s = 0
    for (const sys of systems) {
      for (const d of deliverables) {
        for (const act of activities) {
          s += getEffectiveHours(sys.id, d.id, act.id)
        }
      }
    }
    return s
  }, [systems, deliverables, activities, getEffectiveHours])

  // Per-person totals for Labor & Rates
  const laborHoursAndCost = useMemo(() => {
    const map = new Map<string, { hours: number; cost: number }>()
    for (const l of labor) {
      map.set(l.id, { hours: 0, cost: 0 })
    }
    for (const i of items) {
      if (!i.labor_id) continue
      const entry = map.get(i.labor_id)
      if (!entry) continue
      const hrs = getEffectiveHours(i.bid_sheet_system_id, i.bid_sheet_deliverable_id, i.bid_sheet_activity_id)
      const lab = labor.find((l) => l.id === i.labor_id)
      const rate = lab?.bid_rate ?? 0
      entry.hours += hrs
      entry.cost += hrs * rate
    }
    return map
  }, [items, labor, getEffectiveHours])
  const totalLaborCost = useMemo(() => {
    let s = 0
    for (const sys of systems) {
      for (const d of deliverables) {
        for (const act of activities) {
          const hrs = getEffectiveHours(sys.id, d.id, act.id)
          const laborId = getItemLaborId(sys.id, d.id, act.id)
          const lab = laborId ? labor.find((l) => l.id === laborId) : null
          s += hrs * (lab?.bid_rate ?? 0)
        }
      }
    }
    return s
  }, [systems, deliverables, activities, getEffectiveHours, getItemLaborId, labor])
  const totalIndirectCost = useMemo(() => {
    let s = 0
    for (const cat of INDIRECT_CATEGORIES) {
      const ind = indirectLabor.find((i) => i.category === cat.id)
      const d = indirectDrafts[cat.id]
      const h = parseIndirectDraftNum(d?.hours, ind?.hours ?? 0)
      const r = parseIndirectDraftNum(d?.rate, ind?.rate ?? 0)
      s += indirectLineDollarTotal(h, r, cat.id, ind?.notes)
    }
    for (const ind of indirectLabor) {
      if (!ind.category.startsWith('custom_')) continue
      const d = indirectDrafts[ind.category]
      const h = parseIndirectDraftNum(d?.hours, ind.hours ?? 0)
      const r = parseIndirectDraftNum(d?.rate, ind.rate ?? 0)
      const meta = decodeIndirectNotes(ind.notes)
      const notes =
        encodeIndirectNotes({
          label: d?.label !== undefined ? d.label : meta.label,
          contingencyType: meta.contingencyType || 'none',
          contingencyValue:
            d?.contVal !== undefined ? parseIndirectDraftNum(d.contVal, meta.contingencyValue ?? 0) : meta.contingencyValue ?? 0,
        }) ?? ind.notes
      s += indirectLineDollarTotal(h, r, ind.category, notes)
    }
    return s
  }, [indirectLabor, indirectDrafts])
  const grandTotal = totalLaborCost + totalIndirectCost

  const rowHeight = compactMode ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_NORMAL

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  const handleImportFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setImportCsv(text || '')
      setImportFileName(file.name)
      setError(null)
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    setError(null)
    setImportResult(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      // Show the summary (inserted/merged/skipped counts, CSV vs imported
      // hour totals, and any skipped rows with the reason) so the user can
      // confirm the matrix matches the source spreadsheet before reloading.
      setImportResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddLabor = async () => {
    if (!laborRate) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/labor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: laborUsePlaceholder ? null : laborUserId || null,
          placeholder_name: laborUsePlaceholder ? [laborPlaceholderFirst.trim(), laborPlaceholderLast.trim()].filter(Boolean).join(' ') || null : null,
          bid_rate: parseFloat(laborRate),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setLabor((prev) => [...prev, data])
      setShowAddLabor(false)
      setLaborUserId('')
      setLaborPlaceholderFirst('')
      setLaborPlaceholderLast('')
      setLaborRate('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteLabor = async (laborId: string) => {
    if (!confirm('Remove this labor entry? Cells assigned to this resource will be unassigned.')) return
    const res = await fetch(`/api/bid-sheets/${bidSheetId}/labor?labor_id=${laborId}`, { method: 'DELETE' })
    if (res.ok) {
      setLabor((prev) => prev.filter((l) => l.id !== laborId))
      setItems((prev) => prev.map((i) => (i.labor_id === laborId ? { ...i, labor_id: null } : i)))
    }
  }

  const clearIndirectTimer = useCallback((category: string) => {
    const t = indirectDebounceTimers.current.get(category)
    if (t) clearTimeout(t)
    indirectDebounceTimers.current.delete(category)
  }, [])

  const persistIndirectLaborNow = useCallback(
    async (category: string) => {
      const seq = (indirectPersistSeq.current.get(category) ?? 0) + 1
      indirectPersistSeq.current.set(category, seq)

      const row = indirectLaborRef.current.find((i) => i.category === category)
      const draft = indirectDraftsRef.current[category] || {}
      // Snapshot at request time. We compare against the live draft on
      // response and only clear the draft if it hasn't changed — otherwise
      // the user typed more characters during the API round-trip and
      // wiping the draft would jump the input value back to the saved
      // value mid-typing ("the rate cell keeps refreshing").
      const draftSnapshot = JSON.stringify(draft)

      // Resolve effective treatAs from saved row + any pending notes patch
      // (used so an in-flight Type flip on a custom_* row applies before we
      // decide whether this is an Hours×Rate or Amount save).
      const treatAs = effectiveIndirectTreatAs(category, row?.notes)

      let hours: number
      let rate: number
      if (treatAs === 'expense' && draft.amount !== undefined) {
        // Expense rows: the user typed a dollar amount into the "Amount"
        // field; persist as hours=1 / rate=amount so hours×rate (and every
        // downstream calc) still equals the amount.
        hours = 1
        rate = parseIndirectDraftNum(draft.amount, row?.rate ?? 0)
      } else {
        hours = parseIndirectDraftNum(draft.hours, row?.hours ?? 0)
        rate = parseIndirectDraftNum(draft.rate, row?.rate ?? 0)
      }

      let notes: string | null | undefined = row?.notes ?? undefined
      if (category.startsWith('custom_')) {
        const meta = decodeIndirectNotes(row?.notes)
        const mergedNotes = encodeIndirectNotes({
          label: draft.label !== undefined ? draft.label : meta.label,
          contingencyType: meta.contingencyType || 'none',
          contingencyValue:
            draft.contVal !== undefined ? parseIndirectDraftNum(draft.contVal, meta.contingencyValue ?? 0) : meta.contingencyValue ?? 0,
          // Preserve the user's loggable-vs-expense choice through debounced
          // saves driven by hours/rate/label edits.
          treatAs: meta.treatAs,
        })
        notes = mergedNotes ?? undefined
      }

      setError(null)
      try {
        const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, hours, rate, notes }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save indirect cost')
        if (indirectPersistSeq.current.get(category) !== seq) return

        setIndirectLabor((prev) => prev.filter((i) => i.category !== category).concat([data]))
        // Clear the draft only if nothing has changed since we sent the
        // request. If the user has typed more (or flipped a dropdown),
        // leave the draft alone so their in-progress edit isn't reverted.
        const liveDraft = indirectDraftsRef.current[category]
        if (JSON.stringify(liveDraft || {}) === draftSnapshot) {
          setIndirectDrafts((prev) => {
            const { [category]: _, ...rest } = prev
            indirectDraftsRef.current = rest
            return rest
          })
        }
      } catch (e: unknown) {
        if (indirectPersistSeq.current.get(category) === seq) {
          setError(e instanceof Error ? e.message : 'Failed to save indirect cost')
        }
      }
    },
    [bidSheetId]
  )

  const scheduleIndirectPersist = useCallback(
    (category: string) => {
      clearIndirectTimer(category)
      const t = setTimeout(() => {
        indirectDebounceTimers.current.delete(category)
        void persistIndirectLaborNow(category)
      }, 450)
      indirectDebounceTimers.current.set(category, t)
    },
    [clearIndirectTimer, persistIndirectLaborNow]
  )

  const patchIndirectDraft = useCallback(
    (category: string, patch: Partial<IndirectFieldDraft>) => {
      setIndirectDrafts((prev) => {
        const next = { ...prev, [category]: { ...prev[category], ...patch } }
        indirectDraftsRef.current = next
        return next
      })
      scheduleIndirectPersist(category)
    },
    [scheduleIndirectPersist]
  )

  const flushIndirectOnBlur = useCallback(
    (category: string) => {
      clearIndirectTimer(category)
      void persistIndirectLaborNow(category)
    },
    [clearIndirectTimer, persistIndirectLaborNow]
  )

  /**
   * Persist a "Type" (loggable activity / expense) flip immediately for an
   * `additional_indirect` or `custom_*` row. We re-encode the notes JSON so
   * the existing `treatAs` field round-trips with the row's other metadata
   * (label, contingency) and let the indirect-labor PUT handler do the work
   * of moving project_details ↔ po_expenses on the converted PO.
   */
  const saveIndirectTreatAs = useCallback(
    async (category: string, treatAs: 'activity' | 'expense') => {
      const row = indirectLaborRef.current.find((x) => x.category === category)
      const draft = indirectDraftsRef.current[category] || {}
      const meta = decodeIndirectNotes(row?.notes)
      const hours = parseIndirectDraftNum(draft.hours, row?.hours ?? 0)
      const rate = parseIndirectDraftNum(draft.rate, row?.rate ?? 0)
      const notes = encodeIndirectNotes({
        label: draft.label !== undefined ? draft.label : meta.label,
        contingencyType: meta.contingencyType || 'none',
        contingencyValue:
          draft.contVal !== undefined
            ? parseIndirectDraftNum(draft.contVal, meta.contingencyValue ?? 0)
            : meta.contingencyValue ?? 0,
        treatAs,
      })
      // saveIndirectImmediate is declared just below; use the ref-stable
      // `void` Promise so we don't need to wait for a forward-declared
      // dependency in this hook.
      await persistIndirectLaborForTreatAs(category, { hours, rate, notes: notes ?? undefined })
    },
    // saveIndirectImmediate isn't in scope yet; we forward through a small
    // wrapper we'll create in a moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Tiny shim that reuses the same network logic saveIndirectImmediate uses.
  // Defined separately so saveIndirectTreatAs can reference it without a
  // forward-declaration warning.
  const persistIndirectLaborForTreatAs = useCallback(
    async (category: string, payload: { hours: number; rate: number; notes?: string | null }) => {
      try {
        const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            hours: payload.hours,
            rate: payload.rate,
            notes: payload.notes,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save indirect cost')
        setIndirectLabor((prev) => prev.filter((i) => i.category !== category).concat([data]))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to save indirect cost')
      }
    },
    [bidSheetId]
  )

  /** Immediate save (e.g. contingency type) — cancels pending debounce so drafts merge correctly. */
  const saveIndirectImmediate = useCallback(
    async (category: string, payload: { hours: number; rate: number; notes?: string | null }) => {
      clearIndirectTimer(category)
      const seq = (indirectPersistSeq.current.get(category) ?? 0) + 1
      indirectPersistSeq.current.set(category, seq)
      // Same race protection as persistIndirectLaborNow: snapshot the draft
      // when the request goes out and only clear if the user hasn't typed
      // anything new while we were waiting on the API.
      const draftSnapshot = JSON.stringify(indirectDraftsRef.current[category] || {})
      setError(null)
      try {
        const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            hours: payload.hours,
            rate: payload.rate,
            notes: payload.notes,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save indirect cost')
        if (indirectPersistSeq.current.get(category) !== seq) return

        setIndirectLabor((prev) => prev.filter((i) => i.category !== category).concat([data]))
        const liveDraft = indirectDraftsRef.current[category]
        if (JSON.stringify(liveDraft || {}) === draftSnapshot) {
          setIndirectDrafts((prev) => {
            const { [category]: _, ...rest } = prev
            indirectDraftsRef.current = rest
            return rest
          })
        }
      } catch (e: unknown) {
        if (indirectPersistSeq.current.get(category) === seq) {
          setError(e instanceof Error ? e.message : 'Failed to save indirect cost')
        }
      }
    },
    [bidSheetId, clearIndirectTimer]
  )

  const handleAddIndirect = async () => {
    const category = `custom_${Date.now()}`
    const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, hours: 0, rate: 0, notes: encodeIndirectNotes({ label: '' }) }),
    })
    const data = await res.json()
    if (res.ok) setIndirectLabor((prev) => [...prev, data])
    else setError(data.error || 'Failed to add indirect line')
  }

  const handleDeleteIndirect = async (indirectId: string) => {
    const row = indirectLabor.find((i) => i.id === indirectId)
    if (row) {
      clearIndirectTimer(row.category)
      setIndirectDrafts((prev) => {
        const { [row.category]: _, ...rest } = prev
        indirectDraftsRef.current = rest
        return rest
      })
    }
    const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor?id=${indirectId}`, { method: 'DELETE' })
    if (res.ok) setIndirectLabor((prev) => prev.filter((i) => i.id !== indirectId))
  }

  const handleAddSystem = async () => {
    const name = addSystemName.trim()
    if (!name) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/systems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code: addSystemCode.trim() || undefined,
          description: addSystemDescription.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddSystem(false)
      setAddSystemName('')
      setAddSystemCode('')
      setAddSystemDescription('')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddDeliverable = async () => {
    const name = addDeliverableName.trim()
    if (!name) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: addDeliverableDescription.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddDeliverable(false)
      setAddDeliverableName('')
      setAddDeliverableDescription('')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddActivity = async () => {
    const name = addActivityName.trim()
    if (!name) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: addActivityDescription.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddActivity(false)
      setAddActivityName('')
      setAddActivityDescription('')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSystemEdit = async () => {
    if (!editingSystem || !editSysName.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/systems`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_id: editingSystem.id,
          name: editSysName.trim(),
          code: editSysCode.trim() || null,
          description: editSysDesc.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEditingSystem(null)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDeliverableEdit = async () => {
    if (!editingDeliverable || !editDelName.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/deliverables`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliverable_id: editingDeliverable.id,
          name: editDelName.trim(),
          description: editDelDesc.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEditingDeliverable(null)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveActivityEdit = async () => {
    if (!editingActivity || !editActName.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/activities`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: editingActivity.id,
          name: editActName.trim(),
          description: editActDesc.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEditingActivity(null)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSystem = async (systemId: string, label: string) => {
    if (!confirm(`Delete system "${label}"? All matrix cells for this system will be removed.`)) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/systems?system_id=${encodeURIComponent(systemId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDeliverable = async (deliverableId: string, label: string) => {
    if (!confirm(`Delete deliverable "${label}"? All matrix cells using it will be removed.`)) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/deliverables?deliverable_id=${encodeURIComponent(deliverableId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteActivity = async (activityId: string, label: string) => {
    if (!confirm(`Delete activity "${label}"? All matrix cells using it will be removed.`)) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/activities?activity_id=${encodeURIComponent(activityId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConvert = async () => {
    setError(null)
    if (Object.keys(hourDrafts).length > 0) {
      setError('Finish editing matrix hours (click outside hour fields so values save) before converting.')
      return
    }
    for (const sys of systems) {
      for (const d of deliverables) {
        for (const act of activities) {
          const hrs = getEffectiveHours(sys.id, d.id, act.id)
          if (hrs <= 0) continue
          if (!getItemLaborId(sys.id, d.id, act.id)) {
            setError('Every cell with hours must have a resource or placeholder assigned before converting.')
            return
          }
        }
      }
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_number: convertPoNumber || undefined,
          project_name: convertProjectName || undefined,
          department_id: convertDepartmentId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Convert failed')
      window.location.href = `/dashboard/budget?poId=${data.po_id}`
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveLinkedPoBudget = async () => {
    if (!sheet.converted_po_id) return
    setError(null)
    const raw = poAmountInput.trim()
    const parsed = raw === '' ? null : parseFloat(raw)
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      setError('Enter a valid dollar amount, or leave blank.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/po-budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_po_amount: parsed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (typeof data.po_balance === 'number') setLinkedPoBalance(data.po_balance)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const numInputClass = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
  const inputClass = compactMode
    ? `w-full min-w-[60px] h-6 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs ${numInputClass}`
    : `w-full min-w-[80px] h-7 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm ${numInputClass}`

  const cellClass = compactMode ? 'px-2 py-1' : 'px-3 py-2'
  const labelClass = compactMode ? 'text-xs truncate max-w-[180px]' : 'text-sm'

  const handleExportCSV = () => {
    const headers = 'System_Name,System_Number,Deliverable_Name,Activity_Name,Budgeted_Hours'
    const rows = systems.flatMap((sys) =>
      deliverables.flatMap((d) =>
        activities.map((act) => {
          const hrs = getItemHours(sys.id, d.id, act.id)
          const escape = (v: string | number) => {
            const s = String(v ?? '')
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
          }
          return [escape(sys.name), escape(sys.code ?? ''), escape(d.name), escape(act.name), hrs].join(',')
        })
      )
    )
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bid-sheet-${(sheet.name || 'export').replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{sheet.sites?.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 capitalize">{sheet.status}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          {canEditBidStructure && (
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Upload className="h-4 w-4" /> Import CSV
            </button>
          )}
          {canEdit && sheet.status === 'draft' && (
            <button
              type="button"
              onClick={() => setConvertModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
            >
              <FileSpreadsheet className="h-4 w-4" /> Convert to Project Budget
            </button>
          )}
          {sheet.status === 'converted' && sheet.converted_po_id && (
            <Link
              href={`/dashboard/budget?poId=${sheet.converted_po_id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
            >
              View Project Budget →
            </Link>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>}

      {canEdit && sheet.status === 'converted' && sheet.converted_po_id && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-teal-200 dark:border-teal-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Linked project budget</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Set the overall project budget (original PO amount). Matrix hours and new systems/deliverables/activities sync to the project for timesheets and the budget matrix.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Original PO amount ($)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={poAmountInput}
                onChange={(e) => setPoAmountInput(e.target.value)}
                className="h-10 w-48 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveLinkedPoBudget}
              disabled={loading}
              className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Save budget
            </button>
            <Link
              href={`/dashboard/budget?poId=${sheet.converted_po_id}`}
              className="h-10 inline-flex items-center px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Open full budget →
            </Link>
          </div>
          {linkedPoBalance != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              PO balance (after invoices &amp; COs): ${linkedPoBalance.toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* Systems/Deliverables/Activities + Control Access — 2 columns when canEdit */}
      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Systems, Deliverables & Activities */}
          {canEditBidStructure && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Systems, Deliverables & Activities
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {sheet.status === 'converted'
                  ? 'Add rows, columns, or activity lines. New combinations sync to the linked project (timesheet options and budget matrix).'
                  : 'Add systems (rows), deliverables (columns), and activities to build your bid sheet matrix. You can also import from CSV.'}
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Systems</span>
                  {!showAddSystem ? (
                    <button type="button" onClick={() => setShowAddSystem(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm h-9">
                      <Plus className="h-4 w-4" /> Add System
                    </button>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={addSystemName}
                        onChange={(e) => setAddSystemName(e.target.value)}
                        placeholder="Name (e.g. Local Systems)"
                        className="h-9 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm w-40"
                      />
                      <input
                        type="text"
                        value={addSystemCode}
                        onChange={(e) => setAddSystemCode(e.target.value)}
                        placeholder="Code (optional)"
                        className="h-9 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm w-24"
                      />
                      <button type="button" onClick={handleAddSystem} disabled={loading || !addSystemName.trim()} className="h-9 px-3 bg-blue-600 text-white rounded text-sm disabled:opacity-50 shrink-0">
                        Add
                      </button>
                      <button type="button" onClick={() => { setShowAddSystem(false); setAddSystemName(''); setAddSystemCode(''); setAddSystemDescription('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                        Cancel
                      </button>
                    </div>
                  )}
                  {showAddSystem && (
                    <label className="block w-full max-w-md mt-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Description (optional)</span>
                      <textarea
                        value={addSystemDescription}
                        onChange={(e) => setAddSystemDescription(e.target.value)}
                        placeholder="Scope or notes for this system…"
                        rows={2}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                      />
                    </label>
                  )}
                  {systems.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-xs text-gray-500">{systems.length} system(s)</span>
                      <ul className="text-xs text-gray-700 dark:text-gray-300 max-h-36 overflow-y-auto space-y-1 pr-1">
                        {systems.map((s) => (
                          <li key={s.id} className="flex justify-between gap-2 items-start border-b border-gray-100 dark:border-gray-700 pb-1 last:border-0">
                            <span className="min-w-0">
                              <span className="font-medium">{s.name}</span>
                              {s.code ? <span className="text-gray-500 dark:text-gray-400"> ({s.code})</span> : null}
                              {s.description ? (
                                <span className="block text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2" title={s.description}>
                                  {s.description}
                                </span>
                              ) : null}
                            </span>
                            {canEditBidStructure && (
                              <span className="shrink-0 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSystem(s)
                                    setEditSysName(s.name)
                                    setEditSysCode(s.code ?? '')
                                    setEditSysDesc(s.description ?? '')
                                  }}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSystem(s.id, s.name)}
                                  className="text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Delete
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Deliverables</span>
                  {!showAddDeliverable ? (
                    <button type="button" onClick={() => setShowAddDeliverable(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm h-9">
                      <Plus className="h-4 w-4" /> Add Deliverable
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 max-w-md">
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="text"
                          value={addDeliverableName}
                          onChange={(e) => setAddDeliverableName(e.target.value)}
                          placeholder="Name (e.g. Design Documents)"
                          className="h-9 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm w-40"
                        />
                        <button type="button" onClick={handleAddDeliverable} disabled={loading || !addDeliverableName.trim()} className="h-9 px-3 bg-blue-600 text-white rounded text-sm disabled:opacity-50 shrink-0">
                          Add
                        </button>
                        <button type="button" onClick={() => { setShowAddDeliverable(false); setAddDeliverableName(''); setAddDeliverableDescription('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                          Cancel
                        </button>
                      </div>
                      <textarea
                        value={addDeliverableDescription}
                        onChange={(e) => setAddDeliverableDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                      />
                    </div>
                  )}
                  {deliverables.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-xs text-gray-500">{deliverables.length} deliverable(s)</span>
                      <ul className="text-xs text-gray-700 dark:text-gray-300 max-h-36 overflow-y-auto space-y-1 pr-1">
                        {deliverables.map((d) => (
                          <li key={d.id} className="flex justify-between gap-2 items-start border-b border-gray-100 dark:border-gray-700 pb-1 last:border-0">
                            <span className="min-w-0">
                              <span className="font-medium">{d.name}</span>
                              {d.description ? (
                                <span className="block text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2" title={d.description}>
                                  {d.description}
                                </span>
                              ) : null}
                            </span>
                            {canEditBidStructure && (
                              <span className="shrink-0 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeliverable(d)
                                    setEditDelName(d.name)
                                    setEditDelDesc(d.description ?? '')
                                  }}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDeliverable(d.id, d.name)}
                                  className="text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Delete
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Activities</span>
                  {!showAddActivity ? (
                    <button type="button" onClick={() => setShowAddActivity(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm h-9">
                      <Plus className="h-4 w-4" /> Add Activity
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 max-w-md">
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="text"
                          value={addActivityName}
                          onChange={(e) => setAddActivityName(e.target.value)}
                          placeholder="Name (e.g. Design)"
                          className="h-9 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm w-40"
                        />
                        <button type="button" onClick={handleAddActivity} disabled={loading || !addActivityName.trim()} className="h-9 px-3 bg-blue-600 text-white rounded text-sm disabled:opacity-50 shrink-0">
                          Add
                        </button>
                        <button type="button" onClick={() => { setShowAddActivity(false); setAddActivityName(''); setAddActivityDescription('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                          Cancel
                        </button>
                      </div>
                      <textarea
                        value={addActivityDescription}
                        onChange={(e) => setAddActivityDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm"
                      />
                    </div>
                  )}
                  {activities.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <span className="text-xs text-gray-500">{activities.length} activity(ies)</span>
                      <ul className="text-xs text-gray-700 dark:text-gray-300 max-h-36 overflow-y-auto space-y-1 pr-1">
                        {activities.map((a) => (
                          <li key={a.id} className="flex justify-between gap-2 items-start border-b border-gray-100 dark:border-gray-700 pb-1 last:border-0">
                            <span className="min-w-0">
                              <span className="font-medium">{a.name}</span>
                              {a.description ? (
                                <span className="block text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2" title={a.description}>
                                  {a.description}
                                </span>
                              ) : null}
                            </span>
                            {canEditBidStructure && (
                              <span className="shrink-0 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingActivity(a)
                                    setEditActName(a.name)
                                    setEditActDesc(a.description ?? '')
                                  }}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteActivity(a.id, a.name)}
                                  className="text-red-600 dark:text-red-400 hover:underline"
                                >
                                  Delete
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Right: Control Access */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Control Access
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Grant users explicit access to this bid sheet. Users with site assignment can already view. Add users here for direct access.
            </p>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {accessUsers.length} user{accessUsers.length !== 1 ? 's' : ''} with access
              </span>
              <button
                type="button"
                onClick={async () => {
                  setShowGrantAccess(true)
                  try {
                    const res = await fetch(`/api/bid-sheets/${bidSheetId}/access?available=1`)
                    if (res.ok) {
                      const json = await res.json()
                      setAvailableUsers(json.users || [])
                    }
                  } catch {
                    setAvailableUsers([])
                  }
                }}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Grant Access
              </button>
            </div>
            <div className="space-y-2">
              {accessLoading && accessUsers.length === 0 ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : accessUsers.length === 0 ? (
                <p className="text-sm text-gray-500">No users with explicit access yet.</p>
              ) : (
                accessUsers.map((u) => (
                  <div key={u.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRevokeAccess(u.id)}
                      disabled={accessLoading}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Revoke access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
            {showGrantAccess && (
              <div className="mt-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Select user to grant access</label>
                <select
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  className="w-full h-9 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm mb-2"
                >
                  <option value="">— Select —</option>
                  {availableUsers.filter((a) => !accessUsers.some((x) => x.id === a.id)).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGrantAccess}
                    disabled={accessLoading || !grantUserId}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
                  >
                    Grant
                  </button>
                  <button type="button" onClick={() => { setShowGrantAccess(false); setGrantUserId('') }} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Matrix */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <h3 className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
          Bid Sheet Matrix (Systems × Deliverables × Activities)
        </h3>

        {/* Search & Compact Toggle - Sticky */}
        <div className="sticky top-0 z-30 flex flex-wrap gap-3 items-center px-4 py-2 bg-gray-50 dark:bg-gray-700/80 border-b border-gray-200 dark:border-gray-600">
          {canEditBidStructure && (
            <div className="flex flex-wrap gap-1.5 items-center shrink-0">
              <button
                type="button"
                onClick={() => setShowAddSystem(true)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Plus className="h-3.5 w-3.5" /> System
              </button>
              <button
                type="button"
                onClick={() => setShowAddDeliverable(true)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Plus className="h-3.5 w-3.5" /> Deliverable
              </button>
              <button
                type="button"
                onClick={() => setShowAddActivity(true)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Plus className="h-3.5 w-3.5" /> Activity
              </button>
            </div>
          )}
          <div className="flex-1 min-w-[200px] flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              placeholder="Search Systems (name or number)..."
              className="flex-1 h-9 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>
          {/* Show only rows where at least one cell is assigned to a given
              resource; combines with the systems search above. */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <select
              value={laborFilter}
              onChange={(e) => setLaborFilter(e.target.value)}
              className="h-9 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              title="Filter rows by assigned resource"
            >
              <option value="">All resources</option>
              {labor.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.user_profiles?.name || l.placeholder_name || '(unnamed)'}
                </option>
              ))}
            </select>
            {laborFilter && (
              <button
                type="button"
                onClick={() => setLaborFilter('')}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title="Clear resource filter"
              >
                Clear
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={compactMode}
              onChange={(e) => setCompactMode(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm">Compact Mode</span>
          </label>
          {(systemSearch || laborFilter) && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Showing {filteredRows.length} of {systemActivityRows.length} rows
            </span>
          )}
        </div>

        {/* Mobile: System/Activity list + View button per row */}
        <div className="md:hidden overflow-x-hidden">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredRows.map((row) => (
              <div
                key={`${row.systemId}-${row.activityId}`}
                className="flex justify-between items-center py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <div className="min-w-0 flex-1 truncate" title={`${row.systemName}${row.systemCode ? ` (${row.systemCode})` : ''} · ${row.activityName}`}>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{row.systemName}</span>
                  {row.systemCode && <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">({row.systemCode})</span>}
                  <span className="text-gray-500 dark:text-gray-400"> · </span>
                  <span className="text-gray-500 dark:text-gray-400">{row.activityName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300" title="Sum of hours across deliverables for this row">
                    Σ{' '}
                    {deliverables
                      .reduce((sum, d) => {
                        const k = cellKey(row.systemId, d.id, row.activityId)
                        const draft = hourDrafts[k]
                        if (draft !== undefined) {
                          const t = draft.trim()
                          if (t === '' || t === '.') return sum
                          const p = parseFloat(t)
                          return sum + (Number.isFinite(p) ? p : 0)
                        }
                        return sum + getItemHours(row.systemId, d.id, row.activityId)
                      }, 0)
                      .toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewRow({ systemId: row.systemId, activityId: row.activityId, systemName: row.systemName, activityName: row.activityName })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                  >
                    <Eye className="h-4 w-4" /> View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: full matrix in a single scroll container so we can freeze the
            left System/Activity column and the right-side Sum (hrs) / Row cost
            columns, plus the header on top and the footer on bottom. The previous
            layout used two stacked scroll contexts (outer overflow-x-auto + inner
            overflow-y-auto/x-hidden) which broke `position: sticky` on the body's
            first cell and prevented sticky on header/footer entirely. */}
        {(() => {
          const sysW = compactMode ? 200 : 240
          const colW = compactMode ? 100 : 130
          const sumW = compactMode ? 72 : 88
          const costW = compactMode ? 88 : 104
          const gridCols = `${sysW}px repeat(${deliverables.length}, ${colW}px) ${sumW}px ${costW}px`
          const totalGridWidth = sysW + deliverables.length * colW + sumW + costW
          // Tailwind dynamic class strings + arbitrary `right-[Xpx]` aren't
          // safelisted, so we apply pixel offsets via inline style instead.
          const stickyLeftFirstCellClass =
            'sticky left-0 border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]'
          const stickyRightSumStyle = { right: costW }
          const stickyRightCostStyle = { right: 0 }
          // bg color tokens for sticky cells; sticky cells must paint over the
          // content scrolling behind them, so backgrounds need to be opaque.
          const headerBg = 'bg-gray-50 dark:bg-gray-700'
          const footerBg = 'bg-gray-100 dark:bg-gray-900'
          const bodyLeftBg = 'bg-white dark:bg-gray-800'
          const bodyRightBg = 'bg-gray-50 dark:bg-gray-800'
          return (
            <div
              ref={scrollContainerRef}
              className="hidden md:block w-full min-w-0 max-h-[60vh] overflow-auto"
              style={{ minHeight: 200 }}
            >
              <div
                style={{
                  width: totalGridWidth,
                  minWidth: Math.max(totalGridWidth, 600),
                  position: 'relative',
                }}
              >
                {/* Header — sticky to top of the unified scroll container.
                    First cell sticky-left, last two cells sticky-right so the
                    frozen panes' headers stay in place horizontally too. */}
                <div
                  className={`sticky top-0 z-30 ${headerBg} border-b border-gray-200 dark:border-gray-600`}
                  style={{ display: 'grid', gridTemplateColumns: gridCols }}
                >
                  <div className={`${stickyLeftFirstCellClass} z-40 ${headerBg} px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100`}>
                    System / Activity
                  </div>
                  {deliverables.map((d) => (
                    <div key={d.id} className={`${headerBg} border-r border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100`}>
                      {compactMode ? (d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name) : d.name}
                    </div>
                  ))}
                  <div
                    className={`sticky z-40 ${headerBg} px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 text-right border-l border-gray-200 dark:border-gray-600 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]`}
                    style={stickyRightSumStyle}
                  >
                    Sum (hrs)
                  </div>
                  <div
                    className={`sticky z-40 ${headerBg} px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 text-right border-l border-gray-200 dark:border-gray-600 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]`}
                    style={stickyRightCostStyle}
                  >
                    Row cost
                  </div>
                </div>

                {/* Virtualized body. Each row is fixed-height (rowHeight) so the
                    estimateSize value matches reality and rows don't overlap. */}
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: 'relative',
                    width: '100%',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                    const row = filteredRows[virtualRow.index]
                    if (!row) return null
                    const rowKey = `${row.systemId}-${row.activityId}`
                    const rowSumHrs = deliverables.reduce((sum, d) => sum + getEffectiveHours(row.systemId, d.id, row.activityId), 0)
                    const rowSumCost = matrixAggregates.rowCostByKey.get(rowKey) ?? 0
                    const labelTitle = `${row.systemName}${row.systemCode ? ` (${row.systemCode})` : ''} · ${row.activityName}`
                    return (
                      <div
                        key={rowKey}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: rowHeight,
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: gridCols,
                        }}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <div
                          className={`${stickyLeftFirstCellClass} z-20 ${bodyLeftBg} ${cellClass} flex flex-col justify-center min-w-0 overflow-hidden`}
                          title={labelTitle}
                        >
                          {/* line-clamp-2 lets the system name wrap to two
                              lines so long names like "Delta V Process Control
                              System (PCS) - Paddle Dryer" stay readable; the
                              row height was sized for 2 lines + 1-line activity. */}
                          <span className={`block font-medium ${compactMode ? 'text-xs' : 'text-sm'} text-gray-900 dark:text-gray-100 leading-tight line-clamp-2`}>
                            {row.systemName}
                            {row.systemCode && (
                              <span className="text-gray-500 dark:text-gray-400 ml-1 font-normal">({row.systemCode})</span>
                            )}
                          </span>
                          <span className={`block truncate ${compactMode ? 'text-[10px]' : 'text-xs'} text-gray-500 dark:text-gray-400 leading-tight mt-0.5`}>
                            {row.activityName}
                          </span>
                        </div>
                        {deliverables.map((d) => {
                          const hrs = getItemHours(row.systemId, d.id, row.activityId)
                          const laborId = getItemLaborId(row.systemId, d.id, row.activityId)
                          const k = cellKey(row.systemId, d.id, row.activityId)
                          const displayHrs =
                            hourDrafts[k] !== undefined ? hourDrafts[k] : hrs === 0 ? '' : String(hrs)
                          return (
                            <div key={d.id} className={`${cellClass} border-r border-gray-200 dark:border-gray-600 flex flex-col justify-center gap-0.5 min-w-0 overflow-hidden`}>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={displayHrs}
                                onChange={(e) => {
                                  const v = e.target.value
                                  hourDraftsRef.current[k] = v
                                  setHourDrafts((prev) => ({ ...prev, [k]: v }))
                                  scheduleHoursSave(row.systemId, d.id, row.activityId, laborId)
                                }}
                                onBlur={() => flushHoursOnBlur(row.systemId, d.id, row.activityId, laborId)}
                                disabled={!canEdit}
                                className={inputClass}
                              />
                              {canEdit ? (
                                <select
                                  value={laborId || ''}
                                  onChange={(e) => onLaborCellChange(row.systemId, d.id, row.activityId, e.target.value || null)}
                                  className={`w-full min-w-0 ${compactMode ? 'h-6 text-[10px] px-1 py-0 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'h-7 text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}
                                  disabled={!canEdit}
                                >
                                  <option value="">—</option>
                                  {labor.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.user_profiles?.name || l.placeholder_name || '?'}
                                    </option>
                                  ))}
                                </select>
                              ) : laborId ? (
                                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                  {labor.find((l) => l.id === laborId)?.user_profiles?.name || labor.find((l) => l.id === laborId)?.placeholder_name || '?'}
                                </span>
                              ) : null}
                            </div>
                          )
                        })}
                        <div
                          className={`sticky z-20 ${bodyRightBg} ${cellClass} border-l border-gray-200 dark:border-gray-600 flex items-center justify-end shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]`}
                          style={stickyRightSumStyle}
                        >
                          <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100" title="Sum of hours for this row">
                            {rowSumHrs.toFixed(2)}
                          </span>
                        </div>
                        <div
                          className={`sticky z-20 ${bodyRightBg} ${cellClass} border-l border-gray-200 dark:border-gray-600 flex items-center justify-end shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]`}
                          style={stickyRightCostStyle}
                        >
                          <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100" title="Sum of labor cost for this row">
                            ${rowSumCost.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Footer — sticky to bottom + same frozen left/right columns. */}
                <div
                  className={`sticky bottom-0 z-30 ${footerBg} border-t-2 border-gray-300 dark:border-gray-600`}
                  style={{ display: 'grid', gridTemplateColumns: gridCols }}
                >
                  <div className={`${stickyLeftFirstCellClass} z-40 ${footerBg} px-3 py-2 text-xs font-semibold text-gray-800 dark:text-gray-100`}>
                    Column totals
                  </div>
                  {deliverables.map((d) => (
                    <div
                      key={d.id}
                      className={`${footerBg} border-r border-gray-200 dark:border-gray-600 px-2 py-2 text-right text-xs font-medium tabular-nums text-gray-900 dark:text-gray-100`}
                    >
                      ${(matrixAggregates.columnCosts[d.id] || 0).toFixed(2)}
                    </div>
                  ))}
                  <div
                    className={`sticky z-40 ${footerBg} ${cellClass} border-l border-gray-200 dark:border-gray-600 flex items-center justify-end shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]`}
                    style={stickyRightSumStyle}
                  >
                    <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100" title="Total hours (matrix)">
                      {matrixAggregates.footerTotalHours.toFixed(2)}
                    </span>
                  </div>
                  <div
                    className={`sticky z-40 ${footerBg} ${cellClass} flex items-center justify-end border-l border-gray-200 dark:border-gray-600 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.15)]`}
                    style={stickyRightCostStyle}
                  >
                    <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100" title="Grand total labor cost (matrix)">
                      ${matrixAggregates.matrixGrandCost.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Labor */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Labor & Rates</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Add resources and their bid rates. Assign one resource per cell in the matrix above. Labor cost = sum of (hours × rate) for each assigned cell.
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 text-sm font-medium">Person</th>
              <th className="text-left py-2 text-sm font-medium">Rate ($/hr)</th>
              <th className="text-left py-2 text-sm font-medium">Total Hours</th>
              <th className="text-left py-2 text-sm font-medium">Total Cost</th>
              {canEdit && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {labor.map((l) => {
              const { hours, cost } = laborHoursAndCost.get(l.id) || { hours: 0, cost: 0 }
              return (
              <tr key={l.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="py-2">{l.user_profiles?.name || l.placeholder_name || '-'}</td>
                <td className="py-2">${Number(l.bid_rate).toFixed(2)}</td>
                <td className="py-2 tabular-nums">{hours.toFixed(2)}</td>
                <td className="py-2 tabular-nums">${cost.toFixed(2)}</td>
                {canEdit && (
                  <td>
                    <button type="button" onClick={() => handleDeleteLabor(l.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            )})}
          </tbody>
          {labor.length > 0 && (() => {
            // Roll up Total Hours and Total Cost across every labor row so the
            // table footer mirrors the pattern in the matrix (which has its
            // own column totals). Per-row hours/cost come from the same
            // laborHoursAndCost map the rows render.
            let totalHours = 0
            let totalCost = 0
            for (const l of labor) {
              const { hours, cost } = laborHoursAndCost.get(l.id) || { hours: 0, cost: 0 }
              totalHours += hours
              totalCost += cost
            }
            return (
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 font-semibold">
                  <td className="py-2 text-sm text-gray-800 dark:text-gray-100">Totals</td>
                  <td className="py-2"></td>
                  <td className="py-2 tabular-nums text-gray-900 dark:text-gray-100">{totalHours.toFixed(2)}</td>
                  <td className="py-2 tabular-nums text-gray-900 dark:text-gray-100">${totalCost.toFixed(2)}</td>
                  {canEdit && <td></td>}
                </tr>
              </tfoot>
            )
          })()}
        </table>
        {canEdit && (
          <div className="mt-4">
            {!showAddLabor ? (
              <button type="button" onClick={() => setShowAddLabor(true)} className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline">
                <Plus className="h-4 w-4" /> Add Labor
              </button>
            ) : (
              <div className="flex flex-wrap gap-2 items-end p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!laborUsePlaceholder} onChange={() => setLaborUsePlaceholder(false)} />
                  <span className="text-sm">Existing user</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={laborUsePlaceholder} onChange={() => setLaborUsePlaceholder(true)} />
                  <span className="text-sm">Placeholder</span>
                </label>
                {!laborUsePlaceholder ? (
                  <select
                    value={laborUserId}
                    onChange={(e) => setLaborUserId(e.target.value)}
                    className="h-10 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  >
                    <option value="">-- Select --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      value={laborPlaceholderFirst}
                      onChange={(e) => setLaborPlaceholderFirst(e.target.value)}
                      placeholder="First Name"
                      className="h-10 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-28"
                    />
                    <input
                      type="text"
                      value={laborPlaceholderLast}
                      onChange={(e) => setLaborPlaceholderLast(e.target.value)}
                      placeholder="Last Name"
                      className="h-10 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-28"
                    />
                  </>
                )}
                <input
                  type="number"
                  value={laborRate}
                  onChange={(e) => setLaborRate(e.target.value)}
                  placeholder="Rate ($/hr)"
                  min={0}
                  step={0.01}
                  className="h-10 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-32 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" onClick={handleAddLabor} disabled={!laborRate || (laborUsePlaceholder && !laborPlaceholderFirst.trim() && !laborPlaceholderLast.trim())} className="h-10 px-3 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
                  Add
                </button>
                <button type="button" onClick={() => setShowAddLabor(false)} className="h-10 px-3 border rounded text-sm">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Indirect Costs + Totals: side-by-side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

      {/* Left column: Indirect Costs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Indirect Costs</h3>
        {/* Column headers */}
        <div className="flex gap-4 items-center mb-2 px-1">
          <span className="w-48 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</span>
          <span className="w-24 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center">Hours</span>
          <span className="w-28 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center">Rate ($/hr)</span>
          <span className="w-24 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Total</span>
        </div>
        <div className="space-y-3">
          {INDIRECT_CATEGORIES.map((cat) => {
            const ind = indirectLabor.find((i) => i.category === cat.id)
            const d = indirectDrafts[cat.id]
            const hNum = parseIndirectDraftNum(d?.hours, ind?.hours ?? 0)
            const rNum = parseIndirectDraftNum(d?.rate, ind?.rate ?? 0)
            const hoursDisplay = d?.hours !== undefined ? d.hours : ind == null ? '' : String(ind.hours)
            const rateDisplay = d?.rate !== undefined ? d.rate : ind == null ? '' : String(ind.rate ?? '')
            const treatAs = effectiveIndirectTreatAs(cat.id, ind?.notes)
            const isPickable = cat.id === 'additional_indirect'
            // For expense rows we collapse Hours + Rate into one Amount input.
            // The amount displayed equals the saved row's hours × rate so
            // legacy data with hours != 1 keeps showing the correct dollar
            // amount; on save we force hours=1 so future edits stay clean.
            const isExpense = treatAs === 'expense'
            const savedAmount = ind ? indirectLineDollarTotal(ind.hours ?? 0, ind.rate ?? 0, cat.id, ind.notes) : 0
            const amountDisplay =
              d?.amount !== undefined ? d.amount : ind == null ? '' : savedAmount === 0 ? '' : String(savedAmount)
            const liveAmountForTotal =
              d?.amount !== undefined
                ? parseIndirectDraftNum(d.amount, savedAmount)
                : savedAmount
            return (
              <div key={cat.id} className="flex flex-wrap gap-4 items-center">
                <span className="w-48 text-sm font-medium text-gray-800 dark:text-gray-200">{cat.label}</span>
                {isExpense ? (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={amountDisplay}
                      onChange={(e) => patchIndirectDraft(cat.id, { amount: e.target.value })}
                      onBlur={() => flushIndirectOnBlur(cat.id)}
                      disabled={!canEdit}
                      placeholder="$ amount"
                      title="Dollar amount for this expense line"
                      className={`h-9 w-56 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                    />
                    <span className="w-24 text-right text-sm text-gray-700 dark:text-gray-300">
                      = ${liveAmountForTotal.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={hoursDisplay}
                      onChange={(e) => patchIndirectDraft(cat.id, { hours: e.target.value })}
                      onBlur={() => flushIndirectOnBlur(cat.id)}
                      disabled={!canEdit}
                      placeholder="0"
                      className={`h-9 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={rateDisplay}
                      onChange={(e) => patchIndirectDraft(cat.id, { rate: e.target.value })}
                      onBlur={() => flushIndirectOnBlur(cat.id)}
                      disabled={!canEdit}
                      placeholder="0"
                      className={`h-9 w-28 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                    />
                    <span className="w-24 text-right text-sm text-gray-700 dark:text-gray-300">
                      = ${indirectLineDollarTotal(hNum, rNum, cat.id, ind?.notes).toFixed(2)}
                    </span>
                  </>
                )}
                {/* Type indicator: preset PM / Doc Coord / Proj Controls and
                    T&L are fixed; only Additional Indirect Costs is pickable. */}
                {isPickable ? (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Type</label>
                    <select
                      value={treatAs}
                      onChange={(e) => void saveIndirectTreatAs(cat.id, e.target.value as 'activity' | 'expense')}
                      disabled={!canEdit}
                      className="h-9 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                    >
                      <option value="expense">Expense</option>
                      <option value="activity">Loggable activity</option>
                    </select>
                  </div>
                ) : (
                  <span
                    className={`text-xs px-2 py-1 rounded ${treatAs === 'activity' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    title={treatAs === 'activity' ? 'Logged via timesheet on the converted PO' : 'Tracked as a fixed expense on the converted PO'}
                  >
                    {treatAs === 'activity' ? 'Loggable activity' : 'Expense'}
                  </span>
                )}
              </div>
            )
          })}
          {indirectLabor.filter((i) => i.category.startsWith('custom_')).map((ind) => {
            const meta = decodeIndirectNotes(ind.notes)
            const d = indirectDrafts[ind.category] || {}
            const hNum = parseIndirectDraftNum(d.hours, ind.hours ?? 0)
            const rNum = parseIndirectDraftNum(d.rate, ind.rate ?? 0)
            const notesForLine =
              encodeIndirectNotes({
                label: d.label !== undefined ? d.label : meta.label,
                contingencyType: meta.contingencyType || 'none',
                contingencyValue:
                  d.contVal !== undefined ? parseIndirectDraftNum(d.contVal, meta.contingencyValue ?? 0) : meta.contingencyValue ?? 0,
                treatAs: meta.treatAs,
              }) ?? ind.notes
            const lineTotal = indirectLineDollarTotal(hNum, rNum, ind.category, notesForLine)
            const hoursDisplay = d.hours !== undefined ? d.hours : String(ind.hours)
            const rateDisplay = d.rate !== undefined ? d.rate : String(ind.rate ?? '')
            const labelDisplay = d.label !== undefined ? d.label : meta.label ?? ''
            const contValDisplay =
              d.contVal !== undefined ? d.contVal : meta.contingencyValue != null ? String(meta.contingencyValue) : ''
            const effectiveContingency =
              meta.contingencyType === 'fixed' || meta.contingencyType === 'percent' ? meta.contingencyType : 'none'
            const customTreatAs = effectiveIndirectTreatAs(ind.category, ind.notes)
            const customIsExpense = customTreatAs === 'expense'
            const customSavedAmount = indirectLineDollarTotal(ind.hours ?? 0, ind.rate ?? 0, ind.category, ind.notes)
            const customAmountDisplay =
              d.amount !== undefined ? d.amount : customSavedAmount === 0 ? '' : String(customSavedAmount)
            const customLiveAmount =
              d.amount !== undefined ? parseIndirectDraftNum(d.amount, customSavedAmount) : customSavedAmount
            return (
            <div key={ind.id} className="flex flex-wrap gap-3 items-center">
              <input
                type="text"
                value={labelDisplay}
                onChange={(e) => patchIndirectDraft(ind.category, { label: e.target.value })}
                onBlur={() => flushIndirectOnBlur(ind.category)}
                disabled={!canEdit}
                placeholder="Name"
                className="h-9 w-48 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 font-medium"
              />
              {customIsExpense ? (
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={customAmountDisplay}
                  onChange={(e) => patchIndirectDraft(ind.category, { amount: e.target.value })}
                  onBlur={() => flushIndirectOnBlur(ind.category)}
                  disabled={!canEdit}
                  placeholder="$ amount"
                  title="Dollar amount for this expense line"
                  className={`h-9 w-56 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                />
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={hoursDisplay}
                    onChange={(e) => patchIndirectDraft(ind.category, { hours: e.target.value })}
                    onBlur={() => flushIndirectOnBlur(ind.category)}
                    disabled={!canEdit}
                    placeholder="Hours"
                    className={`h-9 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={rateDisplay}
                    onChange={(e) => patchIndirectDraft(ind.category, { rate: e.target.value })}
                    onBlur={() => flushIndirectOnBlur(ind.category)}
                    disabled={!canEdit}
                    placeholder="Rate ($/hr)"
                    className={`h-9 w-28 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                  />
                </>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">Type</label>
                <select
                  value={customTreatAs}
                  onChange={(e) => void saveIndirectTreatAs(ind.category, e.target.value as 'activity' | 'expense')}
                  disabled={!canEdit}
                  className="h-9 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                >
                  <option value="expense">Expense</option>
                  <option value="activity">Loggable activity</option>
                </select>
                {/* Contingency adds $ or % on top of hours×rate, so it only
                    applies to loggable activity rows. Hidden when the line
                    is being treated as a flat expense. */}
                {!customIsExpense && (
                  <>
                    <label className="text-xs text-gray-500 dark:text-gray-400 ml-2">Contingency</label>
                    <select
                      value={effectiveContingency}
                      onChange={(e) => {
                        const v = e.target.value as 'none' | 'fixed' | 'percent'
                        const row = indirectLaborRef.current.find((x) => x.category === ind.category)
                        const draft = indirectDraftsRef.current[ind.category] || {}
                        const hours = parseIndirectDraftNum(draft.hours, row?.hours ?? 0)
                        const rate = parseIndirectDraftNum(draft.rate, row?.rate ?? 0)
                        const m = decodeIndirectNotes(row?.notes)
                        const notes = encodeIndirectNotes({
                          label: draft.label !== undefined ? draft.label : m.label,
                          contingencyType: v,
                          contingencyValue: v === 'none' ? 0 : m.contingencyValue ?? 0,
                          // Preserve treatAs so flipping contingency doesn't reset
                          // the user's loggable/expense choice.
                          treatAs: m.treatAs,
                        })
                        void saveIndirectImmediate(ind.category, { hours, rate, notes: notes ?? undefined })
                      }}
                      disabled={!canEdit}
                      className="h-9 px-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                    >
                      <option value="none">None</option>
                      <option value="fixed">Add $</option>
                      <option value="percent">Add %</option>
                    </select>
                    {(effectiveContingency === 'fixed' || effectiveContingency === 'percent') && (
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={contValDisplay}
                        onChange={(e) => patchIndirectDraft(ind.category, { contVal: e.target.value })}
                        onBlur={() => flushIndirectOnBlur(ind.category)}
                        disabled={!canEdit}
                        placeholder={effectiveContingency === 'percent' ? '%' : '$'}
                        className={`h-9 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 ${numInputClass}`}
                      />
                    )}
                  </>
                )}
              </div>
              <span className="text-gray-600 dark:text-gray-400">
                = ${(customIsExpense ? customLiveAmount : lineTotal).toFixed(2)}
              </span>
              {canEdit && (
                <button type="button" onClick={() => handleDeleteIndirect(ind.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            )
          })}
        </div>
        {(() => {
          // Sum hours (activity rows only — expense rows store a synthetic
          // hours=1 / rate=amount so adding their hours into the total
          // would be misleading) and dollar totals across every indirect-
          // labor row.
          let totalHours = 0
          let totalDollar = 0
          for (const ind of indirectLabor) {
            const draft = indirectDrafts[ind.category] || {}
            const meta = decodeIndirectNotes(ind.notes)
            const notesForLine =
              encodeIndirectNotes({
                label: draft.label !== undefined ? draft.label : meta.label,
                contingencyType: meta.contingencyType || 'none',
                contingencyValue:
                  draft.contVal !== undefined
                    ? parseIndirectDraftNum(draft.contVal, meta.contingencyValue ?? 0)
                    : meta.contingencyValue ?? 0,
                treatAs: meta.treatAs,
              }) ?? ind.notes
            const rowTreatAs = effectiveIndirectTreatAs(ind.category, ind.notes)
            if (rowTreatAs === 'expense') {
              const savedAmount = indirectLineDollarTotal(ind.hours ?? 0, ind.rate ?? 0, ind.category, ind.notes)
              const liveAmount =
                draft.amount !== undefined ? parseIndirectDraftNum(draft.amount, savedAmount) : savedAmount
              totalDollar += liveAmount
            } else {
              const hNum = parseIndirectDraftNum(draft.hours, ind.hours ?? 0)
              const rNum = parseIndirectDraftNum(draft.rate, ind.rate ?? 0)
              totalHours += hNum
              totalDollar += indirectLineDollarTotal(hNum, rNum, ind.category, notesForLine)
            }
          }
          return (
            <div className="mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-600 flex gap-4 items-center font-semibold">
              <span className="w-48 text-sm text-gray-800 dark:text-gray-100">Totals</span>
              <span className="w-24 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100">
                {totalHours.toFixed(2)}
              </span>
              <span className="w-28"></span>
              <span className="w-24 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                = ${totalDollar.toFixed(2)}
              </span>
            </div>
          )
        })()}
        {canEdit && (
          <button
            type="button"
            onClick={handleAddIndirect}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus className="h-4 w-4" /> Add Indirect Cost
          </button>
        )}
      </div>{/* end Indirect Costs */}

      {/* Right column: Totals */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 self-start">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Totals</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Total Budgeted Hours</span>
            <span className="font-medium">{totalBudgetedHours.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="flex items-center gap-1">
              Total Labor Cost (est.)
              <span
                className="inline-flex text-gray-500 cursor-help"
                title="Sum of (hours × rate) for each matrix cell with an assigned resource. Assign a resource in each cell to include it in this total."
              >
                <Info className="h-4 w-4" />
              </span>
            </span>
            <span className="font-medium">${totalLaborCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Indirect Costs</span>
            <span className="font-medium">${totalIndirectCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <span>Grand Total Project Cost</span>
            <span>${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      </div>{/* end 2-column grid */}

      {/* View Deliverables Modal (mobile) */}
      {viewRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewRow(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate pr-2">
                {viewRow.systemName}{viewRow.systemName && viewRow.activityName ? ' · ' : ''}{viewRow.activityName}
              </h3>
              <button type="button" onClick={() => setViewRow(null)} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-auto flex-1 px-4 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-2 font-medium">Deliverable</th>
                    <th className="text-right py-2 font-medium">Hrs</th>
                    <th className="text-left py-2 font-medium">Resource</th>
                    <th className="text-right py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map((d) => {
                    const hrs = getItemHours(viewRow.systemId, d.id, viewRow.activityId)
                    const laborId = getItemLaborId(viewRow.systemId, d.id, viewRow.activityId)
                    const cost = getItemCost(viewRow.systemId, d.id, viewRow.activityId)
                    const laborName = laborId ? labor.find((l) => l.id === laborId)?.user_profiles?.name || labor.find((l) => l.id === laborId)?.placeholder_name || '?' : '—'
                    return (
                      <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 text-gray-900 dark:text-gray-100">{d.name}</td>
                        <td className="py-2 text-right">{hrs > 0 ? hrs : '—'}</td>
                        <td className="py-2 text-gray-600 dark:text-gray-400">{laborName}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{(hrs > 0 && laborId) ? `$${cost.toFixed(2)}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit system (name, code, description) */}
      {editingSystem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingSystem(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit system</h3>
              <button type="button" onClick={() => setEditingSystem(null)} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editSysName}
                  onChange={(e) => setEditSysName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code (optional)</label>
                <input
                  type="text"
                  value={editSysCode}
                  onChange={(e) => setEditSysCode(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  value={editSysDesc}
                  onChange={(e) => setEditSysDesc(e.target.value)}
                  rows={4}
                  placeholder="Scope or notes for this system…"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingSystem(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSystemEdit}
                disabled={loading || !editSysName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDeliverable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingDeliverable(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit deliverable</h3>
              <button type="button" onClick={() => setEditingDeliverable(null)} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editDelName}
                  onChange={(e) => setEditDelName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  value={editDelDesc}
                  onChange={(e) => setEditDelDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingDeliverable(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDeliverableEdit}
                disabled={loading || !editDelName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingActivity(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit activity</h3>
              <button type="button" onClick={() => setEditingActivity(null)} className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editActName}
                  onChange={(e) => setEditActName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  value={editActDesc}
                  onChange={(e) => setEditActDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingActivity(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveActivityEdit}
                disabled={loading || !editActName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowImportModal(false); setImportCsv(''); setImportFileName(null) }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Import CSV</h3>
              <button type="button" onClick={() => { setShowImportModal(false); setImportCsv(''); setImportFileName(null) }}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Format requirements</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-outside pl-5">
                  <li>First row must be column headers</li>
                  <li>Use comma-separated values (no spaces after commas)</li>
                  <li>One data row per system/deliverable/activity combination</li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Column headers (in this order)</h4>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-outside pl-5 mb-2">
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">System_Name</code></li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">System_Number</code> (can be blank)</li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Deliverable_Name</code></li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Activity_Name</code></li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Budgeted_Hours</code> (optional — omit or leave blank for 0)</li>
                </ol>
                <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded overflow-x-auto mt-2">
                  <code className="text-sm font-mono whitespace-nowrap">
                    System_Name,System_Number,Deliverable_Name,Activity_Name,Budgeted_Hours
                  </code>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Example</h4>
                <div className="bg-gray-100 dark:bg-gray-700 rounded overflow-x-auto overflow-y-hidden">
                  <table className="text-xs font-mono w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 dark:border-gray-600">
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">System_Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">System_Number</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">Deliverable_Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">Activity_Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-gray-100">Budgeted_Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200 dark:border-gray-600">
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Local Systems</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">LS-01</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Design Documents</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Design</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">40</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Local Systems</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">LS-01</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Design Documents</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">Review</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">10</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  After import, assign a resource to each cell in the matrix.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload CSV file</label>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImportFile(file)
                    e.target.value = ''
                  }}
                />
                <div
                  onDragOver={(e) => { e.preventDefault(); setImportDragOver(true) }}
                  onDragLeave={() => setImportDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setImportDragOver(false)
                    const file = e.dataTransfer.files?.[0]
                    if (file) handleImportFile(file)
                  }}
                  onClick={() => importFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    importDragOver
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <Upload className="h-10 w-10 mx-auto text-gray-500 dark:text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {importFileName ? (
                      <span className="font-medium text-green-600 dark:text-green-400">{importFileName}</span>
                    ) : (
                      <>Drag and drop a CSV file here, or click to choose</>
                    )}
                  </p>
                </div>
              </div>
            </div>
            {importResult && (
              <div className="px-4 pb-4">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Import summary</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
                    <div>CSV rows read</div>
                    <div className="text-right font-medium">{importResult.csvRowCount}</div>
                    <div>Cells inserted</div>
                    <div className="text-right font-medium">{importResult.inserted}</div>
                    <div>Duplicates merged (hours summed)</div>
                    <div className="text-right font-medium">{importResult.merged}</div>
                    <div>Rows skipped</div>
                    <div className={`text-right font-medium ${importResult.skipped > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{importResult.skipped}</div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">CSV hours total</div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1 text-right font-medium">{importResult.csvHoursTotal.toFixed(2)}</div>
                    <div>Imported hours total</div>
                    <div className={`text-right font-medium ${Math.abs(importResult.csvHoursTotal - importResult.importedHoursTotal) > 0.001 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                      {importResult.importedHoursTotal.toFixed(2)}
                    </div>
                  </div>
                  {Math.abs(importResult.csvHoursTotal - importResult.importedHoursTotal) > 0.001 && (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                      Discrepancy of {(importResult.csvHoursTotal - importResult.importedHoursTotal).toFixed(2)} hours between CSV and imported total. See skipped rows below.
                    </p>
                  )}
                  {importResult.skippedRows.length > 0 && (
                    <div className="mt-3">
                      <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Skipped rows</h5>
                      <ul className="max-h-48 overflow-y-auto text-xs space-y-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2">
                        {importResult.skippedRows.map((r, idx) => (
                          <li key={idx} className="text-gray-700 dark:text-gray-300">
                            <span className="font-mono text-gray-500 dark:text-gray-400">L{r.line}</span> – {r.row}
                            <span className="text-amber-700 dark:text-amber-300"> ({r.reason}{r.hours ? `, ${r.hours.toFixed(2)} hrs` : ''})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="p-4 border-t flex justify-end gap-2">
              {importResult ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false)
                    setImportCsv('')
                    setImportFileName(null)
                    setImportResult(null)
                    window.location.reload()
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  Done
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => { setShowImportModal(false); setImportCsv(''); setImportFileName(null); setImportResult(null) }} className="px-4 py-2 border rounded-lg">Cancel</button>
                  <button type="button" onClick={handleImport} disabled={loading || !importCsv.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Import</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Convert Modal */}
      {convertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConvertModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Convert to Project Budget</h3>
              <button type="button" onClick={() => setConvertModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">PO Number</label>
                <input
                  type="text"
                  value={convertPoNumber}
                  onChange={(e) => setConvertPoNumber(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Project Name</label>
                <input
                  type="text"
                  value={convertProjectName}
                  onChange={(e) => setConvertProjectName(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Department</label>
                <select
                  value={convertDepartmentId}
                  onChange={(e) => setConvertDepartmentId(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="">-- Optional --</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This will create a new Project PO, copy matrix items to project_details, add labor rates to po_bill_rates, and link the bid sheet.
              </p>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setConvertModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button type="button" onClick={handleConvert} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">Convert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
