'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import { formatHours } from '@/lib/utils'

/** Variance always shows numeric (0.00 when balanced); formatHours treats 0 as em dash. */
function fmtVariance(n: number): string {
  return n.toFixed(2)
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function safeFileBase(name: string): string {
  const s = name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return s.slice(0, 80) || 'project-matrix'
}

const EPS = 1e-6

function rowBudgetPct(r: MatrixRow): number | null {
  return r.budgetedHours > 0 ? (r.actualHours / r.budgetedHours) * 100 : null
}

/** Hour columns: zero, or positive bands (hours). */
type HourBucket = '' | 'zero' | 'gt0_lte24' | 'gt24_lte100' | 'gt100'

function matchesHourBucket(h: number, bucket: HourBucket): boolean {
  if (!bucket) return true
  const z = Math.abs(h) < EPS
  if (bucket === 'zero') return z
  if (bucket === 'gt0_lte24') return !z && h <= 24 + EPS
  if (bucket === 'gt24_lte100') return h > 24 + EPS && h <= 100 + EPS
  if (bucket === 'gt100') return h > 100 + EPS
  return true
}

type VarianceBucket = '' | 'zero' | 'over' | 'under'

function matchesVarianceBucket(v: number, bucket: VarianceBucket): boolean {
  if (!bucket) return true
  if (bucket === 'zero') return Math.abs(v) < EPS
  if (bucket === 'over') return v < -EPS
  if (bucket === 'under') return v > EPS
  return true
}

/** Budget %: N/A (no budget hours), 0%, bands, or over 100%. */
type PctBucket = '' | 'na' | 'zero' | 'r0_50' | 'r50_100' | 'gt100'

function matchesPctBucket(pct: number | null, bucket: PctBucket): boolean {
  if (!bucket) return true
  if (bucket === 'na') return pct === null
  if (pct === null) return false
  if (bucket === 'zero') return Math.abs(pct) < EPS
  if (bucket === 'r0_50') return pct > EPS && pct <= 50 + EPS
  if (bucket === 'r50_100') return pct > 50 + EPS && pct <= 100 + EPS
  if (bucket === 'gt100') return pct > 100 + EPS
  return true
}

const selectClass =
  'rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm'

type MatrixRow = {
  id: string
  systemLabel: string
  deliverableName: string
  activityName: string
  description?: string | null
  budgetedHours: number
  actualHours: number
  variance: number
  /** budgetedHours × blended PO bill rate (est.) */
  budgetCost: number
  /** Sum of (hours × effective user rate) from approved timesheets for this matrix row */
  actualCost: number
  costVariance: number
}

type IndirectLineRow = {
  id: string
  label: string
  budgetCost: number
  actualCost: number
}

type MatrixPayload = {
  siteId?: string | null
  costModel?: {
    blendedBudgetRate: number
    budgetCostLabel: string
  }
  rows: MatrixRow[]
  indirectLines?: IndirectLineRow[]
  totals: {
    budgetedHours: number
    actualHoursInMatrix: number
    actualHoursAllEntries: number
    unmatchedActualHours: number
    /** Labor matrix only (same as summing row Est. budget $ before indirect). */
    matrixBudgetCost?: number
    matrixActualCost?: number
    indirectBudgetCost?: number
    indirectActualCost?: number
    /** Labor + indirect (matches bid sheet grand total when fully converted). */
    budgetCost: number
    actualCost: number
    costVariance: number
  }
}

type SortColumn =
  | 'system'
  | 'deliverable'
  | 'activity'
  | 'description'
  | 'budget'
  | 'actual'
  | 'variance'
  | 'pct'
  | 'budgetCost'
  | 'actualCost'
  | 'costVariance'

type ProjectBudgetMatrixProps = {
  poId: string
  refreshTick: number
  /** Shown under the title and in print; optional filename hint. */
  reportTitle?: string
  /** Used for download filenames (e.g. PO number). */
  fileBaseName?: string
  /** Manager/admin/super_admin: add rows, edit budget/description, delete rows. */
  canEditMatrix?: boolean
  onMatrixRefresh?: () => void
}

export default function ProjectBudgetMatrix({
  poId,
  refreshTick,
  reportTitle,
  fileBaseName,
  canEditMatrix = false,
  onMatrixRefresh,
}: ProjectBudgetMatrixProps) {
  const [data, setData] = useState<MatrixPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSystem, setFilterSystem] = useState('')
  const [filterDeliverable, setFilterDeliverable] = useState('')
  const [filterActivity, setFilterActivity] = useState('')
  const [filterBudget, setFilterBudget] = useState<HourBucket>('')
  const [filterActual, setFilterActual] = useState<HourBucket>('')
  const [filterVariance, setFilterVariance] = useState<VarianceBucket>('')
  const [filterPct, setFilterPct] = useState<PctBucket>('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('system')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [showAddRow, setShowAddRow] = useState(false)
  const [addSys, setAddSys] = useState('')
  const [addSysCode, setAddSysCode] = useState('')
  const [addDel, setAddDel] = useState('')
  const [addAct, setAddAct] = useState('')
  const [addBudget, setAddBudget] = useState('0')
  const [addDesc, setAddDesc] = useState('')
  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState<string | null>(null)

  const [editingRow, setEditingRow] = useState<MatrixRow | null>(null)
  const [editBudget, setEditBudget] = useState('')
  const [editDesc, setEditDesc] = useState('')
  // Editing state for indirect / PO-expense lines (the rows below the labor
  // matrix). Mirrors editingRow but for po_expenses, so an admin can fix the
  // label / amount / notes without leaving the matrix view.
  const [editingIndirect, setEditingIndirect] = useState<IndirectLineRow | null>(null)
  const [editIndirectLabel, setEditIndirectLabel] = useState('')
  const [editIndirectAmount, setEditIndirectAmount] = useState('')

  const bumpRefresh = () => onMatrixRefresh?.()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/budget/${poId}/project-matrix`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || `Could not load matrix (${res.status})`)
        }
        const json = (await res.json()) as MatrixPayload
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load project matrix')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poId, refreshTick])

  const filterOptions = useMemo(() => {
    if (!data?.rows.length) {
      return { systems: [] as string[], deliverables: [] as string[], activities: [] as string[] }
    }
    const sys = new Set<string>()
    const del = new Set<string>()
    const act = new Set<string>()
    for (const r of data.rows) {
      if (r.systemLabel) sys.add(r.systemLabel)
      if (r.deliverableName) del.add(r.deliverableName)
      if (r.activityName) act.add(r.activityName)
    }
    return {
      systems: [...sys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      deliverables: [...del].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      activities: [...act].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    }
  }, [data?.rows])

  const filteredRows = useMemo(() => {
    if (!data?.rows.length) return []
    return data.rows.filter((r) => {
      if (filterSystem && r.systemLabel !== filterSystem) return false
      if (filterDeliverable && r.deliverableName !== filterDeliverable) return false
      if (filterActivity && r.activityName !== filterActivity) return false
      if (!matchesHourBucket(r.budgetedHours, filterBudget)) return false
      if (!matchesHourBucket(r.actualHours, filterActual)) return false
      if (!matchesVarianceBucket(r.variance, filterVariance)) return false
      if (!matchesPctBucket(rowBudgetPct(r), filterPct)) return false
      return true
    })
  }, [data, filterSystem, filterDeliverable, filterActivity, filterBudget, filterActual, filterVariance, filterPct])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    const mult = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'system':
          cmp = a.systemLabel.localeCompare(b.systemLabel, undefined, { sensitivity: 'base' })
          break
        case 'deliverable':
          cmp = a.deliverableName.localeCompare(b.deliverableName, undefined, { sensitivity: 'base' })
          break
        case 'activity':
          cmp = a.activityName.localeCompare(b.activityName, undefined, { sensitivity: 'base' })
          break
        case 'description': {
          const da = (a.description ?? '').trim()
          const db = (b.description ?? '').trim()
          cmp = da.localeCompare(db, undefined, { sensitivity: 'base' })
          break
        }
        case 'budget':
          cmp = a.budgetedHours - b.budgetedHours
          break
        case 'actual':
          cmp = a.actualHours - b.actualHours
          break
        case 'variance':
          cmp = a.variance - b.variance
          break
        case 'pct': {
          const va = a.budgetedHours > 0 ? a.actualHours / a.budgetedHours : null
          const vb = b.budgetedHours > 0 ? b.actualHours / b.budgetedHours : null
          if (va == null && vb == null) cmp = 0
          else if (va == null) cmp = 1
          else if (vb == null) cmp = -1
          else cmp = va - vb
          break
        }
        case 'budgetCost':
          cmp = a.budgetCost - b.budgetCost
          break
        case 'actualCost':
          cmp = a.actualCost - b.actualCost
          break
        case 'costVariance':
          cmp = a.costVariance - b.costVariance
          break
        default:
          cmp = 0
      }
      return mult * cmp
    })
    return rows
  }, [filteredRows, sortColumn, sortDir])

  const indirectLines = data?.indirectLines ?? []
  const indirectBudgetTotal = data?.totals.indirectBudgetCost ?? indirectLines.reduce((s, r) => s + r.budgetCost, 0)
  const indirectActualTotal = data?.totals.indirectActualCost ?? indirectLines.reduce((s, r) => s + r.actualCost, 0)

  const visibleTotals = useMemo(() => {
    const budgetedHours = sortedRows.reduce((s, r) => s + r.budgetedHours, 0)
    const actualHoursInMatrix = sortedRows.reduce((s, r) => s + r.actualHours, 0)
    const budgetCost = sortedRows.reduce((s, r) => s + (r.budgetCost ?? 0), 0)
    const actualCost = sortedRows.reduce((s, r) => s + (r.actualCost ?? 0), 0)
    return {
      budgetedHours,
      actualHoursInMatrix,
      variance: budgetedHours - actualHoursInMatrix,
      pct: budgetedHours > 0 ? (actualHoursInMatrix / budgetedHours) * 100 : null,
      budgetCost,
      actualCost,
      costVariance: budgetCost - actualCost,
    }
  }, [sortedRows])

  const laborPlusIndirectTotals = useMemo(() => {
    const grandBudget = visibleTotals.budgetCost + indirectBudgetTotal
    const grandActual = visibleTotals.actualCost + indirectActualTotal
    return {
      grandBudget,
      grandActual,
      grandCostVar: grandBudget - grandActual,
      indirectVar: indirectBudgetTotal - indirectActualTotal,
    }
  }, [visibleTotals, indirectBudgetTotal, indirectActualTotal])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir(
        col === 'budget' ||
          col === 'actual' ||
          col === 'variance' ||
          col === 'pct' ||
          col === 'budgetCost' ||
          col === 'actualCost' ||
          col === 'costVariance'
          ? 'desc'
          : 'asc'
      )
    }
  }

  const openEdit = (r: MatrixRow) => {
    setMutateError(null)
    setEditingRow(r)
    setEditBudget(String(r.budgetedHours))
    setEditDesc((r.description ?? '') || '')
  }

  const handleSaveEdit = async () => {
    if (!editingRow) return
    setMutating(true)
    setMutateError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/project-details`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRow.id,
          budgeted_hours: Number(editBudget) || 0,
          description: editDesc.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Save failed')
      setEditingRow(null)
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setMutating(false)
    }
  }

  const handleDeleteRow = async (r: MatrixRow) => {
    if (!confirm(`Remove this matrix row?\n${r.systemLabel} · ${r.deliverableName} · ${r.activityName}`)) return
    setMutating(true)
    setMutateError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/project-details?id=${encodeURIComponent(r.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Delete failed')
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setMutating(false)
    }
  }

  /**
   * Open the edit modal for an indirect / PO-expense line. We only allow
   * editing rows backed by a real po_expenses record — the bid_sheet
   * fallback rows aren't writable from this view (their ids are prefixed
   * with `bid-sheet-indirect:`).
   */
  const startEditIndirect = (ir: IndirectLineRow) => {
    if (ir.id.startsWith('bid-sheet-indirect:')) return
    setEditingIndirect(ir)
    setEditIndirectLabel(ir.label || '')
    setEditIndirectAmount(String(ir.budgetCost ?? 0))
  }

  const handleSaveIndirect = async () => {
    if (!editingIndirect) return
    const trimmed = editIndirectLabel.trim()
    if (!trimmed) {
      setMutateError('Label is required')
      return
    }
    const amt = Number(editIndirectAmount)
    if (!Number.isFinite(amt) || amt < 0) {
      setMutateError('Amount must be a non-negative number')
      return
    }
    setMutating(true)
    setMutateError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/expenses/${encodeURIComponent(editingIndirect.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_type_name: trimmed,
          amount: amt,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Save failed')
      setEditingIndirect(null)
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setMutating(false)
    }
  }

  /**
   * Delete an indirect / PO-expense line straight from the matrix view. The
   * indirect lines render from `po_expenses` (or, when none exist, from the
   * bid sheet's `bid_sheet_indirect_labor` fallback — those rows have ids
   * prefixed with `bid-sheet-indirect:` and aren't deletable here). After a
   * successful delete we call bumpRefresh so the matrix re-fetches and the
   * Indirect subtotal / Grand total rows update without a page reload.
   */
  const handleDeleteIndirect = async (id: string, label: string) => {
    if (id.startsWith('bid-sheet-indirect:')) return
    if (!confirm(`Delete this expense from the PO budget?\n${label}`)) return
    setMutating(true)
    setMutateError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/expenses/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Delete failed')
      }
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setMutating(false)
    }
  }

  const handleAddRow = async () => {
    setMutating(true)
    setMutateError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/project-details`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_name: addSys.trim(),
          system_code: addSysCode.trim() || null,
          deliverable_name: addDel.trim(),
          activity_name: addAct.trim(),
          budgeted_hours: Number(addBudget) || 0,
          description: addDesc.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not add row')
      setAddSys('')
      setAddSysCode('')
      setAddDel('')
      setAddAct('')
      setAddBudget('0')
      setAddDesc('')
      setShowAddRow(false)
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Could not add row')
    } finally {
      setMutating(false)
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const exportCsv = () => {
    if (!data || (sortedRows.length === 0 && indirectLines.length === 0)) return
    const q = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`
    const headers = [
      'System',
      'Deliverable',
      'Activity',
      'Description',
      'Budget (h)',
      'Actual (h)',
      'Var (h)',
      'Budget %',
      'Est. budget ($)',
      'Actual ($)',
      'Var ($)',
    ]
    const lines: string[] = []
    if (reportTitle) {
      lines.push([q('Report'), q(reportTitle)].join(','))
    }
    lines.push([q('Generated'), q(new Date().toISOString())].join(','))
    const filterSummary = [
      filterSystem && `System=${filterSystem}`,
      filterDeliverable && `Deliverable=${filterDeliverable}`,
      filterActivity && `Activity=${filterActivity}`,
      filterBudget && `Budget=${filterBudget}`,
      filterActual && `Actual=${filterActual}`,
      filterVariance && `Var=${filterVariance}`,
      filterPct && `Budget %=${filterPct}`,
    ]
      .filter(Boolean)
      .join('; ')
    if (filterSummary) {
      lines.push([q('Filters'), q(filterSummary)].join(','))
    }
    lines.push([q('Sort'), q(`${sortColumn} ${sortDir}`)].join(','))
    lines.push(headers.join(','))
    for (const r of sortedRows) {
      const pct = r.budgetedHours > 0 ? (r.actualHours / r.budgetedHours) * 100 : ''
      const bc = r.budgetCost ?? 0
      const ac = r.actualCost ?? 0
      const vc = r.costVariance ?? bc - ac
      lines.push(
        [
          q(r.systemLabel),
          q(r.deliverableName),
          q(r.activityName),
          q((r.description ?? '').trim()),
          q(r.budgetedHours.toFixed(2)),
          q(r.actualHours.toFixed(2)),
          q(r.variance.toFixed(2)),
          pct === '' ? q('') : q(Number(pct.toFixed(2))),
          q(bc.toFixed(2)),
          q(ac.toFixed(2)),
          q(vc.toFixed(2)),
        ].join(',')
      )
    }
    for (const ir of indirectLines) {
      const vc = ir.budgetCost - ir.actualCost
      lines.push(
        [
          q('Indirect (PO expense)'),
          q(ir.label),
          q('—'),
          q(''),
          q(''),
          q(''),
          q(''),
          q(''),
          q(ir.budgetCost.toFixed(2)),
          q(ir.actualCost.toFixed(2)),
          q(vc.toFixed(2)),
        ].join(',')
      )
    }
    lines.push(
      [
        q(filterSummary ? 'Totals (visible labor rows)' : 'Totals (labor matrix)'),
        q(''),
        q(''),
        q(''),
        q(visibleTotals.budgetedHours.toFixed(2)),
        q(visibleTotals.actualHoursInMatrix.toFixed(2)),
        q(visibleTotals.variance.toFixed(2)),
        visibleTotals.pct == null ? q('') : q(Number(visibleTotals.pct.toFixed(2))),
        q(visibleTotals.budgetCost.toFixed(2)),
        q(visibleTotals.actualCost.toFixed(2)),
        q(visibleTotals.costVariance.toFixed(2)),
      ].join(',')
    )
    if (indirectBudgetTotal > EPS) {
      const iv = indirectBudgetTotal - indirectActualTotal
      lines.push(
        [
          q('Indirect (PO expenses, subtotal)'),
          q(''),
          q(''),
          q(''),
          q(''),
          q(''),
          q(''),
          q(''),
          q(indirectBudgetTotal.toFixed(2)),
          q(indirectActualTotal.toFixed(2)),
          q(iv.toFixed(2)),
        ].join(',')
      )
      const gb = visibleTotals.budgetCost + indirectBudgetTotal
      const ga = visibleTotals.actualCost + indirectActualTotal
      lines.push(
        [
          q('Grand total (labor + indirect)'),
          q(''),
          q(''),
          q(''),
          q(visibleTotals.budgetedHours.toFixed(2)),
          q(visibleTotals.actualHoursInMatrix.toFixed(2)),
          q(visibleTotals.variance.toFixed(2)),
          visibleTotals.pct == null ? q('') : q(Number(visibleTotals.pct.toFixed(2))),
          q(gb.toFixed(2)),
          q(ga.toFixed(2)),
          q((gb - ga).toFixed(2)),
        ].join(',')
      )
    }
    const t = data.totals
    lines.push([q('Total hours on PO (all approved entries)'), q(t.actualHoursAllEntries.toFixed(2))].join(','))
    if (t.unmatchedActualHours > 0) {
      lines.push([q('Unmatched hours (not on matrix rows)'), q(t.unmatchedActualHours.toFixed(2))].join(','))
    }
    const csvContent = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const base = safeFileBase(fileBaseName || reportTitle || 'project-matrix')
    const day = new Date().toISOString().split('T')[0]
    a.download = `project-matrix_${base}_${day}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  const hasRows = data && (data.rows.length > 0 || indirectLines.length > 0)
  const hasActiveFilters = Boolean(
    filterSystem ||
      filterDeliverable ||
      filterActivity ||
      filterBudget ||
      filterActual ||
      filterVariance ||
      filterPct
  )
  const showTable = hasRows && (sortedRows.length > 0 || indirectLines.length > 0)

  return (
    <div className="report-print-container bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Project matrix (system × deliverable × activity)
          </h2>
          {reportTitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 break-words">{reportTitle}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 print:text-gray-700">
            Generated {new Date().toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 print:hidden">
            Budgeted hours from bid conversion vs actual hours from approved timesheets on this PO (matched by system, deliverable, and activity).
            <span className="block mt-1">Var (h) = budget − actual (positive means under budget).</span>
            {data?.costModel && (
              <>
                <span className="block mt-1">{data.costModel.budgetCostLabel}</span>
                {data.costModel.blendedBudgetRate > 0 && (
                  <span className="block mt-1 text-gray-600 dark:text-gray-400">
                    Blended rate for budget $ estimate: ${fmtMoney(data.costModel.blendedBudgetRate)}/hr
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden shrink-0">
          {canEditMatrix && (
            <button
              type="button"
              onClick={() => {
                setMutateError(null)
                setShowAddRow((v) => !v)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {showAddRow ? 'Hide add row' : 'Add matrix row'}
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={!hasRows || (sortedRows.length === 0 && indirectLines.length === 0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!hasRows || (sortedRows.length === 0 && indirectLines.length === 0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Use your browser print dialog to save as PDF"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {mutateError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {mutateError}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && data && data.rows.length === 0 && indirectLines.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-4 space-y-2">
          <p>No project matrix rows yet. Convert a bid sheet to populate this PO{canEditMatrix ? ', or add a row below.' : '.'}</p>
        </div>
      )}

      {canEditMatrix && showAddRow && (
        <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 print:hidden space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add matrix row</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Creates or reuses systems, deliverables, and activities for this site by name, then links them to this PO. If the same combination already exists, budget and description are updated.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              System name *
              <input
                value={addSys}
                onChange={(e) => setAddSys(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                placeholder="e.g. HVAC"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              System code (optional)
              <input
                value={addSysCode}
                onChange={(e) => setAddSysCode(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                placeholder="e.g. TA-1320"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Deliverable *
              <input
                value={addDel}
                onChange={(e) => setAddDel(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Activity *
              <input
                value={addAct}
                onChange={(e) => setAddAct(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Budget (h)
              <input
                type="number"
                min={0}
                step="0.01"
                value={addBudget}
                onChange={(e) => setAddBudget(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:col-span-2 lg:col-span-3">
              Description (optional)
              <textarea
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                rows={2}
                className="mt-1 w-full px-2 py-1.5 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                placeholder="Scope or notes for this line…"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={mutating || !addSys.trim() || !addDel.trim() || !addAct.trim()}
              onClick={handleAddRow}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save row
            </button>
            <button type="button" onClick={() => setShowAddRow(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {hasRows && data && data.rows.length > 0 && (
        <div className="mb-4 print:hidden space-y-3">
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">System:</span>
              <select
                value={filterSystem}
                onChange={(e) => setFilterSystem(e.target.value)}
                className={`${selectClass} min-w-[200px]`}
              >
                <option value="">All</option>
                {filterOptions.systems.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Deliverable:</span>
              <select
                value={filterDeliverable}
                onChange={(e) => setFilterDeliverable(e.target.value)}
                className={`${selectClass} min-w-[180px]`}
              >
                <option value="">All</option>
                {filterOptions.deliverables.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Activity:</span>
              <select
                value={filterActivity}
                onChange={(e) => setFilterActivity(e.target.value)}
                className={`${selectClass} min-w-[180px]`}
              >
                <option value="">All</option>
                {filterOptions.activities.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Budget (h):</span>
              <select
                value={filterBudget}
                onChange={(e) => setFilterBudget(e.target.value as HourBucket)}
                className={`${selectClass} min-w-[160px]`}
              >
                <option value="">All</option>
                <option value="zero">Zero (0 h)</option>
                <option value="gt0_lte24">&gt; 0 to 24 h</option>
                <option value="gt24_lte100">&gt; 24 to 100 h</option>
                <option value="gt100">&gt; 100 h</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Actual (h):</span>
              <select
                value={filterActual}
                onChange={(e) => setFilterActual(e.target.value as HourBucket)}
                className={`${selectClass} min-w-[160px]`}
              >
                <option value="">All</option>
                <option value="zero">Zero (0 h)</option>
                <option value="gt0_lte24">&gt; 0 to 24 h</option>
                <option value="gt24_lte100">&gt; 24 to 100 h</option>
                <option value="gt100">&gt; 100 h</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Var (h):</span>
              <select
                value={filterVariance}
                onChange={(e) => setFilterVariance(e.target.value as VarianceBucket)}
                className={`${selectClass} min-w-[200px]`}
              >
                <option value="">All</option>
                <option value="zero">Zero</option>
                <option value="over">Over budget (&lt; 0)</option>
                <option value="under">Under budget (&gt; 0)</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Budget %:</span>
              <select
                value={filterPct}
                onChange={(e) => setFilterPct(e.target.value as PctBucket)}
                className={`${selectClass} min-w-[180px]`}
              >
                <option value="">All</option>
                <option value="na">— (no budget)</option>
                <option value="zero">0%</option>
                <option value="r0_50">1% to 50%</option>
                <option value="r50_100">51% to 100%</option>
                <option value="gt100">&gt; 100%</option>
              </select>
            </label>
          </div>
          {hasActiveFilters && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Showing {sortedRows.length} of {data!.rows.length} rows
            </p>
          )}
        </div>
      )}

      {hasRows && hasActiveFilters && sortedRows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6">No rows match your filter.</p>
      )}

      {showTable && (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[1180px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('system')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    System
                    <SortIcon col="system" />
                  </button>
                </th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('deliverable')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Deliverable
                    <SortIcon col="deliverable" />
                  </button>
                </th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('activity')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Activity
                    <SortIcon col="activity" />
                  </button>
                </th>
                <th className="text-left py-2 pr-4 max-w-[220px] font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('description')}
                    className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Description
                    <SortIcon col="description" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('budget')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Budget (h)
                    <SortIcon col="budget" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('actual')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Actual (h)
                    <SortIcon col="actual" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('variance')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Var (h)
                    <SortIcon col="variance" />
                  </button>
                </th>
                <th className="text-right py-2 pl-2 font-medium text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => handleSort('pct')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Budget %
                    <SortIcon col="pct" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('budgetCost')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                    title="Budgeted hours × blended PO bill rate"
                  >
                    Est. budget ($)
                    <SortIcon col="budgetCost" />
                  </button>
                </th>
                <th className="text-right py-2 px-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('actualCost')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                    title="Approved timesheet hours × each person’s rate"
                  >
                    Actual ($)
                    <SortIcon col="actualCost" />
                  </button>
                </th>
                <th className="text-right py-2 pl-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('costVariance')}
                    className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Var ($)
                    <SortIcon col="costVariance" />
                  </button>
                </th>
                {canEditMatrix && (
                  <th className="text-right py-2 pl-2 font-medium text-gray-700 dark:text-gray-300 print:hidden w-[1%] whitespace-nowrap">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => {
                const pct = rowBudgetPct(r)
                const varCls =
                  r.budgetedHours > 0
                    ? r.variance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                    : ''
                const budgetCost = r.budgetCost ?? 0
                const actualCost = r.actualCost ?? 0
                const costVar = r.costVariance ?? budgetCost - actualCost
                const costVarCls =
                  budgetCost > 0 || actualCost > 0
                    ? costVar < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                    : ''
                const descText = (r.description ?? '').trim()
                return (
                  <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-4 text-gray-900 dark:text-gray-100 align-top">{r.systemLabel}</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">{r.deliverableName}</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">{r.activityName}</td>
                    <td
                      className="py-2 pr-4 text-gray-600 dark:text-gray-400 align-top max-w-[220px] text-xs"
                      title={descText || undefined}
                    >
                      {descText ? <span className="line-clamp-3 whitespace-pre-wrap break-words">{descText}</span> : '—'}
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums">{formatHours(r.budgetedHours)}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{formatHours(r.actualHours)}</td>
                    <td className={`text-right py-2 px-2 tabular-nums ${varCls}`}>{fmtVariance(r.variance)}</td>
                    <td className="text-right py-2 pl-2 tabular-nums text-gray-600 dark:text-gray-400">
                      {pct === null ? '—' : `${pct.toFixed(0)}%`}
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-800 dark:text-gray-200">${fmtMoney(budgetCost)}</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-800 dark:text-gray-200">${fmtMoney(actualCost)}</td>
                    <td className={`text-right py-2 pl-2 tabular-nums ${costVarCls}`}>${fmtMoney(costVar)}</td>
                    {canEditMatrix && (
                      <td className="py-2 pl-2 print:hidden align-top whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          disabled={mutating}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-xs mr-2"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(r)}
                          disabled={mutating}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline text-xs"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {indirectLines.map((ir) => {
                const costVar = ir.budgetCost - ir.actualCost
                const costVarCls =
                  ir.budgetCost > 0 || ir.actualCost > 0
                    ? costVar < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                    : ''
                // Fallback rows synthesized from bid_sheet_indirect_labor
                // when the PO has no real po_expenses; these aren't deletable
                // because there's nothing in po_expenses to remove.
                const isFallbackRow = ir.id.startsWith('bid-sheet-indirect:')
                return (
                  <tr key={`indirect-${ir.id}`} className="border-b border-gray-100 dark:border-gray-700 bg-amber-50/40 dark:bg-amber-950/15">
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">Indirect</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top" title={ir.label}>
                      {ir.label}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-500 align-top">—</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-500 align-top max-w-[220px] text-xs">PO expense</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-2 pl-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-800 dark:text-gray-200">${fmtMoney(ir.budgetCost)}</td>
                    <td className="text-right py-2 px-2 tabular-nums text-gray-800 dark:text-gray-200">${fmtMoney(ir.actualCost)}</td>
                    <td className={`text-right py-2 pl-2 tabular-nums ${costVarCls}`}>${fmtMoney(costVar)}</td>
                    {canEditMatrix && (
                      <td className="print:hidden py-2 pl-2 text-xs whitespace-nowrap">
                        {isFallbackRow ? (
                          <span
                            className="text-gray-500 dark:text-gray-500"
                            title="This line is computed from the bid sheet because no PO expense exists yet — there's nothing here to edit."
                          >
                            —
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => startEditIndirect(ir)}
                              disabled={mutating}
                              className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIndirect(ir.id, ir.label)}
                              disabled={mutating}
                              className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-900/40 border-t-2 border-gray-200 dark:border-gray-600">
                <td className="py-3 pr-4" colSpan={4}>
                  {indirectLines.length > 0
                    ? hasActiveFilters
                      ? 'Totals (visible labor rows)'
                      : 'Totals (labor matrix)'
                    : hasActiveFilters
                      ? 'Totals (visible rows)'
                      : 'Totals (matrix rows)'}
                </td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.budgetedHours)}</td>
                <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.actualHoursInMatrix)}</td>
                <td className="text-right py-3 px-2 tabular-nums">{fmtVariance(visibleTotals.variance)}</td>
                <td className="text-right py-3 pl-2 tabular-nums text-gray-600 dark:text-gray-400">
                  {visibleTotals.pct == null ? '—' : `${visibleTotals.pct.toFixed(0)}%`}
                </td>
                <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(visibleTotals.budgetCost)}</td>
                <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(visibleTotals.actualCost)}</td>
                <td className="text-right py-3 pl-2 tabular-nums">${fmtMoney(visibleTotals.costVariance)}</td>
                {canEditMatrix && <td className="print:hidden" />}
              </tr>
              {indirectBudgetTotal > EPS && (
                <>
                  <tr className="font-semibold bg-amber-50/60 dark:bg-amber-950/25 border-t border-amber-200/80 dark:border-amber-900/50">
                    <td className="py-3 pr-4" colSpan={4}>
                      Indirect subtotal (PO expenses){hasActiveFilters ? ' — full PO, not filtered' : ''}
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-3 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-3 px-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-3 pl-2 tabular-nums text-gray-500 dark:text-gray-500">—</td>
                    <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(indirectBudgetTotal)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(indirectActualTotal)}</td>
                    <td className="text-right py-3 pl-2 tabular-nums">${fmtMoney(laborPlusIndirectTotals.indirectVar)}</td>
                    {canEditMatrix && <td className="print:hidden" />}
                  </tr>
                  <tr className="font-bold bg-gray-100 dark:bg-gray-900/70 border-t-2 border-gray-300 dark:border-gray-600">
                    <td className="py-3 pr-4" colSpan={4}>
                      Grand total (labor + indirect)
                      {hasActiveFilters && sortedRows.length > 0 ? ' — labor uses visible rows; indirect is full PO' : ''}
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.budgetedHours)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{formatHours(visibleTotals.actualHoursInMatrix)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{fmtVariance(visibleTotals.variance)}</td>
                    <td className="text-right py-3 pl-2 tabular-nums text-gray-600 dark:text-gray-400">
                      {visibleTotals.pct == null ? '—' : `${visibleTotals.pct.toFixed(0)}%`}
                    </td>
                    <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(laborPlusIndirectTotals.grandBudget)}</td>
                    <td className="text-right py-3 px-2 tabular-nums">${fmtMoney(laborPlusIndirectTotals.grandActual)}</td>
                    <td className="text-right py-3 pl-2 tabular-nums">${fmtMoney(laborPlusIndirectTotals.grandCostVar)}</td>
                    {canEditMatrix && <td className="print:hidden" />}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingIndirect && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden"
          onClick={() => !mutating && setEditingIndirect(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit indirect / expense line</h3>
              <button
                type="button"
                onClick={() => !mutating && setEditingIndirect(null)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                This is a PO-level expense. For richer fields (date, expense type, notes), edit it from the budget detail page&apos;s Additional Expenses panel.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Label</span>
                <input
                  type="text"
                  value={editIndirectLabel}
                  onChange={(e) => setEditIndirectLabel(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Amount ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editIndirectAmount}
                  onChange={(e) => setEditIndirectAmount(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </label>
              {mutateError && (
                <p className="text-sm text-red-600 dark:text-red-400">{mutateError}</p>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingIndirect(null)}
                disabled={mutating}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveIndirect}
                disabled={mutating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => !mutating && setEditingRow(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit matrix row</h3>
              <button
                type="button"
                onClick={() => !mutating && setEditingRow(null)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                To rename system, deliverable, or activity, update them on the bid sheet (if linked) or in site setup. Here you can adjust budget hours and the row description.
              </p>
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">System</span>
                <p className="text-gray-900 dark:text-gray-100">{editingRow.systemLabel}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Deliverable</span>
                <p className="text-gray-900 dark:text-gray-100">{editingRow.deliverableName}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Activity</span>
                <p className="text-gray-900 dark:text-gray-100">{editingRow.activityName}</p>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Budget (h)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Description (optional)</span>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder="Scope or notes for this line…"
                />
              </label>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                disabled={mutating}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={mutating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {data && data.totals.unmatchedActualHours > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-4 print:text-amber-900">
          {formatHours(data.totals.unmatchedActualHours)} billed on this PO do not match a matrix row (missing system/deliverable/activity on
          timesheet entries, or combo not in the matrix).
        </p>
      )}

      {hasRows && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          All approved timesheets · total hours on PO: {formatHours(data!.totals.actualHoursAllEntries)}
        </p>
      )}
    </div>
  )
}
