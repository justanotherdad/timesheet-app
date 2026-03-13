'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { Upload, Plus, Trash2, X, FileSpreadsheet, Search, Info, Download, Layers, Eye, Users } from 'lucide-react'

interface Item {
  id: string
  bid_sheet_system_id: string
  bid_sheet_deliverable_id: string
  bid_sheet_activity_id: string
  budgeted_hours: number
  labor_id?: string | null
  bid_sheet_systems?: { id: string; name: string; code?: string }
  bid_sheet_deliverables?: { id: string; name: string }
  bid_sheet_activities?: { id: string; name: string }
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

const INDIRECT_CATEGORIES = [
  { id: 'project_management', label: 'Project Management' },
  { id: 'document_coordinator', label: 'Document Coordinator' },
  { id: 'project_controls', label: 'Project Controls' },
  { id: 'travel_living_project', label: 'Travel & Living (Project by Person)' },
  { id: 'travel_living_fat', label: 'Travel & Living (FAT)' },
  { id: 'additional_indirect', label: 'Additional Indirect Costs' },
] as const

const ROW_HEIGHT_NORMAL = 72
const ROW_HEIGHT_COMPACT = 52

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
}: {
  sheet: any
  items: Item[]
  labor: Labor[]
  indirectLabor: IndirectLabor[]
  systems: Array<{ id: string; name: string; code?: string }>
  deliverables: Array<{ id: string; name: string }>
  activities: Array<{ id: string; name: string }>
  departments?: Array<{ id: string; name: string }>
  user: { id: string; profile: { role: string } }
  readOnly?: boolean
}) {
  const depts = departments ?? []
  const [items, setItems] = useState(initialItems)
  const [labor, setLabor] = useState(initialLabor)
  const [indirectLabor, setIndirectLabor] = useState(initialIndirect)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
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
  const [compactMode, setCompactMode] = useState(false)
  const [viewRow, setViewRow] = useState<{ systemId: string; activityId: string; systemName: string; activityName: string } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const canEdit = !readOnly && ['manager', 'admin', 'super_admin'].includes(user.profile.role)
  const bidSheetId = sheet.id

  // Add system / deliverable / activity
  const [showAddSystem, setShowAddSystem] = useState(false)
  const [showAddDeliverable, setShowAddDeliverable] = useState(false)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [addSystemName, setAddSystemName] = useState('')
  const [addSystemCode, setAddSystemCode] = useState('')
  const [addDeliverableName, setAddDeliverableName] = useState('')
  const [addActivityName, setAddActivityName] = useState('')

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

  const setItemCell = useCallback(async (systemId: string, deliverableId: string, activityId: string, hours: number, laborId: string | null) => {
    if (!canEdit) return
    setLoading(true)
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
      setItems((prev) => {
        const rest = prev.filter((i) => !(i.bid_sheet_system_id === systemId && i.bid_sheet_deliverable_id === deliverableId && i.bid_sheet_activity_id === activityId))
        return [...rest, { ...data, bid_sheet_systems: systems.find((s) => s.id === systemId), bid_sheet_deliverables: deliverables.find((d) => d.id === deliverableId), bid_sheet_activities: activities.find((a) => a.id === activityId) }]
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [bidSheetId, canEdit, systems, deliverables, activities])

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
    if (!systemSearch.trim()) return systemActivityRows
    const q = systemSearch.trim().toLowerCase()
    return systemActivityRows.filter((row) => {
      const nameMatch = (row.systemName || '').toLowerCase().includes(q)
      const codeMatch = (row.systemCode || '').toLowerCase().includes(q)
      return nameMatch || codeMatch
    })
  }, [systemActivityRows, systemSearch])

  const totalBudgetedHours = items.reduce((s, i) => s + (i.budgeted_hours || 0), 0)

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
      const hrs = i.budgeted_hours || 0
      const lab = labor.find((l) => l.id === i.labor_id)
      const rate = lab?.bid_rate ?? 0
      entry.hours += hrs
      entry.cost += hrs * rate
    }
    return map
  }, [items, labor])
  const totalLaborCost = items.reduce((s, i) => {
    const lab = i.labor_id ? labor.find((l) => l.id === i.labor_id) : null
    const rate = lab?.bid_rate ?? 0
    return s + (i.budgeted_hours || 0) * rate
  }, 0)
  const totalIndirectCost = indirectLabor.reduce((s, i) => s + (i.hours || 0) * (i.rate || 0), 0)
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
    setLoading(true)
    try {
      const res = await fetch(`/api/bid-sheets/${bidSheetId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      window.location.reload()
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

  const handleIndirectChange = async (category: string, hours: number, rate: number, notes?: string) => {
    const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, hours, rate, notes }),
    })
    const data = await res.json()
    if (res.ok) setIndirectLabor((prev) => prev.filter((i) => i.category !== category).concat([data]))
  }

  const handleAddIndirect = async () => {
    const category = `custom_${Date.now()}`
    const res = await fetch(`/api/bid-sheets/${bidSheetId}/indirect-labor`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, hours: 0, rate: 0, notes: 'Custom' }),
    })
    const data = await res.json()
    if (res.ok) setIndirectLabor((prev) => [...prev, data])
  }

  const handleDeleteIndirect = async (indirectId: string) => {
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
        body: JSON.stringify({ name, code: addSystemCode.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddSystem(false)
      setAddSystemName('')
      setAddSystemCode('')
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
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddDeliverable(false)
      setAddDeliverableName('')
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
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setShowAddActivity(false)
      setAddActivityName('')
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConvert = async () => {
    setError(null)
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
          {canEdit && sheet.status === 'draft' && (
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Upload className="h-4 w-4" /> Import CSV
              </button>
              <button
                type="button"
                onClick={() => setConvertModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
              >
                <FileSpreadsheet className="h-4 w-4" /> Convert to Project Budget
              </button>
            </>
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

      {/* Systems/Deliverables/Activities + Control Access — 2 columns when canEdit */}
      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Systems, Deliverables & Activities (draft only) */}
          {sheet.status === 'draft' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Systems, Deliverables & Activities
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Add systems (rows), deliverables (columns), and activities to build your bid sheet matrix. You can also import from CSV.
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
                      <button type="button" onClick={() => { setShowAddSystem(false); setAddSystemName(''); setAddSystemCode('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                        Cancel
                      </button>
                    </div>
                  )}
                  {systems.length > 0 && <span className="text-xs text-gray-500">{systems.length} system(s)</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Deliverables</span>
                  {!showAddDeliverable ? (
                    <button type="button" onClick={() => setShowAddDeliverable(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm h-9">
                      <Plus className="h-4 w-4" /> Add Deliverable
                    </button>
                  ) : (
                    <div className="flex gap-2 items-center">
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
                      <button type="button" onClick={() => { setShowAddDeliverable(false); setAddDeliverableName('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                        Cancel
                      </button>
                    </div>
                  )}
                  {deliverables.length > 0 && <span className="text-xs text-gray-500">{deliverables.length} deliverable(s)</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Activities</span>
                  {!showAddActivity ? (
                    <button type="button" onClick={() => setShowAddActivity(true)} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm h-9">
                      <Plus className="h-4 w-4" /> Add Activity
                    </button>
                  ) : (
                    <div className="flex gap-2 items-center">
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
                      <button type="button" onClick={() => { setShowAddActivity(false); setAddActivityName('') }} className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded text-sm shrink-0">
                        Cancel
                      </button>
                    </div>
                  )}
                  {activities.length > 0 && <span className="text-xs text-gray-500">{activities.length} activity(ies)</span>}
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={compactMode}
              onChange={(e) => setCompactMode(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm">Compact Mode</span>
          </label>
          {systemSearch && (
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
                <button
                  type="button"
                  onClick={() => setViewRow({ systemId: row.systemId, activityId: row.activityId, systemName: row.systemName, activityName: row.activityName })}
                  className="ml-2 shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <Eye className="h-4 w-4" /> View
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: full matrix with horizontal scroll */}
        {(() => {
          const sysW = compactMode ? 180 : 200
          const colW = compactMode ? 100 : 130
          const gridCols = `${sysW}px repeat(${deliverables.length}, ${colW}px)`
          return (
            <div className="hidden md:block min-w-[600px]">
              {/* Header row - same grid as body rows */}
              <div
                className="flex border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
                style={{ display: 'grid', gridTemplateColumns: gridCols }}
              >
                <div className="border-r border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  System / Activity
                </div>
                {deliverables.map((d) => (
                  <div key={d.id} className="border-r border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {compactMode ? (d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name) : d.name}
                  </div>
                ))}
              </div>

              <div ref={scrollContainerRef} className="overflow-auto max-h-[60vh]" style={{ minHeight: 200 }}>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', minWidth: sysW + deliverables.length * colW }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                    const row = filteredRows[virtualRow.index]
                    if (!row) return null
                    return (
                      <div
                        key={`${row.systemId}-${row.activityId}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: gridCols,
                        }}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <div className="sticky left-0 z-[5] border-r border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                          <span className={`font-medium ${labelClass}`} title={row.systemName}>{row.systemName}</span>
                          {row.systemCode && <span className="text-gray-500 dark:text-gray-400 ml-1">({row.systemCode})</span>}
                          <span className="text-gray-500 dark:text-gray-400"> · </span>
                          <span className={`text-gray-500 dark:text-gray-400 ${labelClass}`} title={row.activityName}>{row.activityName}</span>
                        </div>
                        {deliverables.map((d) => {
                          const hrs = getItemHours(row.systemId, d.id, row.activityId)
                          const laborId = getItemLaborId(row.systemId, d.id, row.activityId)
                          const cost = getItemCost(row.systemId, d.id, row.activityId)
                          return (
                            <div key={d.id} className={`${cellClass} border-r border-gray-200 dark:border-gray-600 flex flex-col gap-0.5`}>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={hrs || ''}
                                onChange={(e) => setItemCell(row.systemId, d.id, row.activityId, parseFloat(e.target.value) || 0, laborId)}
                                disabled={!canEdit}
                                className={inputClass}
                              />
                              {canEdit ? (
                                <select
                                  value={laborId || ''}
                                  onChange={(e) => setItemCell(row.systemId, d.id, row.activityId, hrs, e.target.value || null)}
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
                              {(hrs > 0 && laborId) ? (
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">${cost.toFixed(0)}</span>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
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
                <td className="py-2">{hours.toFixed(1)}</td>
                <td className="py-2">${cost.toFixed(0)}</td>
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

      {/* Indirect Costs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Indirect Costs</h3>
        <div className="space-y-4">
          {INDIRECT_CATEGORIES.map((cat) => {
            const ind = indirectLabor.find((i) => i.category === cat.id)
            return (
              <div key={cat.id} className="flex flex-wrap gap-4 items-center">
                <span className="w-48 font-medium">{cat.label}</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={ind?.hours ?? ''}
                  onChange={(e) => handleIndirectChange(cat.id, parseFloat(e.target.value) || 0, ind?.rate ?? 0)}
                  disabled={!canEdit}
                  placeholder="Hours"
                  className="h-9 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={ind?.rate ?? ''}
                  onChange={(e) => handleIndirectChange(cat.id, ind?.hours ?? 0, parseFloat(e.target.value) || 0)}
                  disabled={!canEdit}
                  placeholder="Rate ($/hr)"
                  className="h-9 w-28 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-gray-600 dark:text-gray-400">
                  = ${((ind?.hours || 0) * (ind?.rate || 0)).toFixed(2)}
                </span>
              </div>
            )
          })}
          {indirectLabor.filter((i) => i.category.startsWith('custom_')).map((ind) => (
            <div key={ind.id} className="flex flex-wrap gap-4 items-center">
              <input
                type="text"
                value={ind.notes || 'Custom'}
                onChange={(e) => handleIndirectChange(ind.category, ind.hours ?? 0, ind.rate ?? 0, e.target.value)}
                disabled={!canEdit}
                placeholder="Label"
                className="h-9 w-48 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 font-medium"
              />
              <input
                type="number"
                min={0}
                step={0.5}
                value={ind.hours ?? ''}
                onChange={(e) => handleIndirectChange(ind.category, parseFloat(e.target.value) || 0, ind.rate ?? 0, ind.notes ?? undefined)}
                disabled={!canEdit}
                placeholder="Hours"
                className="h-9 w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={ind.rate ?? ''}
                onChange={(e) => handleIndirectChange(ind.category, ind.hours ?? 0, parseFloat(e.target.value) || 0, ind.notes ?? undefined)}
                disabled={!canEdit}
                placeholder="Rate ($/hr)"
                className="h-9 w-28 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-gray-600 dark:text-gray-400">
                = ${((ind.hours || 0) * (ind.rate || 0)).toFixed(2)}
              </span>
              {canEdit && (
                <button type="button" onClick={() => handleDeleteIndirect(ind.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleAddIndirect}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus className="h-4 w-4" /> Add Indirect Cost
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Totals</h3>
        <div className="space-y-2 max-w-md">
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
                        <td className="py-2 text-right font-medium">{(hrs > 0 && laborId) ? `$${cost.toFixed(0)}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => { setShowImportModal(false); setImportCsv(''); setImportFileName(null) }} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button type="button" onClick={handleImport} disabled={loading || !importCsv.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Import</button>
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
