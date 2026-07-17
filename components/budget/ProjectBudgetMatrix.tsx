'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import { formatHours } from '@/lib/utils'
import ProjectBySystemView from './ProjectBySystemView'
import ProjectByIndividualView from './ProjectByIndividualView'

type ProjectBudgetTab = 'matrix' | 'by-system' | 'by-individual'

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
  /** Concrete FK ids for this row's combo (used to seed the Edit dialog and
   *  to detect whether the combo actually changed). Optional for safety on
   *  older payloads / indirect rows. */
  systemId?: string | null
  deliverableId?: string | null
  activityId?: string | null
  systemLabel: string
  deliverableName: string
  activityName: string
  description?: string | null
  budgetedHours: number
  /** Explicit per-row budget bill rate ($/hr), or null when using the fallback rate. */
  billRate?: number | null
  /** Rate actually used for budgetCost (explicit bill_rate, else bid/blended). */
  effectiveBudgetRate?: number
  actualHours: number
  variance: number
  /** budgetedHours × effective budget rate (est.) */
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
  /** Distinguishes real po_expenses from bid-sheet projections used as a display fallback. */
  source?: 'po_expense' | 'bidsheet_fallback'
  /** Bid sheet row ID — present on fallback rows so we can create a real po_expense from them. */
  bidSheetRowId?: string
}

type MissingActivity = {
  bidSheetRowId: string
  category: string
  notes: string | null
  activityName: string
  hours: number
}

type MatrixPayload = {
  siteId?: string | null
  costModel?: {
    blendedBudgetRate: number
    budgetCostLabel: string
  }
  rows: MatrixRow[]
  indirectLines?: IndirectLineRow[]
  /** Activity-type indirect rows (PM, DocCoord, etc.) that should be in the regular matrix
   *  via project_details but are missing — usually because the PO was converted before
   *  the activity-type logic was added. */
  missingActivities?: MissingActivity[]
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
  // Active tab is mirrored to ?tab=… so the selection survives a refresh and
  // can be linked / bookmarked. The matrix is the default for backward
  // compatibility (no tab param == matrix).
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: ProjectBudgetTab =
    tabParam === 'by-system' || tabParam === 'by-individual' ? tabParam : 'matrix'
  const setActiveTab = useCallback(
    (tab: ProjectBudgetTab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === 'matrix') params.delete('tab')
      else params.set('tab', tab)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

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
  const [addBillRate, setAddBillRate] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState<string | null>(null)

  const [editingRow, setEditingRow] = useState<MatrixRow | null>(null)
  const [editBudget, setEditBudget] = useState('')
  const [editBillRate, setEditBillRate] = useState('')
  const [editDesc, setEditDesc] = useState('')
  // Cascading picks for the Edit matrix row dialog. Same dedup model as the
  // Reassign dialog: the user picks a system display label, then a
  // deliverable (broadened across all underlying systems with that label),
  // then an activity. On save we resolve the concrete system_id from the
  // picked deliverable. Empty = leave the row's existing combo as-is.
  const [editSystemLabel, setEditSystemLabel] = useState('')
  const [editDeliverableId, setEditDeliverableId] = useState('')
  const [editActivityId, setEditActivityId] = useState('')
  const [editCombosLoading, setEditCombosLoading] = useState(false)
  const [editCombosError, setEditCombosError] = useState<string | null>(null)
  // Editing state for indirect / PO-expense lines (the rows below the labor
  // matrix). Mirrors editingRow but for po_expenses, so an admin can fix the
  // label / amount / notes without leaving the matrix view.
  const [editingIndirect, setEditingIndirect] = useState<IndirectLineRow | null>(null)
  const [editIndirectLabel, setEditIndirectLabel] = useState('')
  const [editIndirectAmount, setEditIndirectAmount] = useState('')

  // Add-indirect-cost form (item #8): create a new indirect line straight on
  // the matrix without going back to a bid sheet. An "expense" creates a
  // po_expense; a "loggable activity" creates an Indirect/Indirect/<name>
  // project_details row people can log time against.
  const [showAddIndirect, setShowAddIndirect] = useState(false)
  const [addIndirectType, setAddIndirectType] = useState<'expense' | 'activity'>('expense')
  const [addIndirectLabel, setAddIndirectLabel] = useState('')
  const [addIndirectAmount, setAddIndirectAmount] = useState('')
  const [addIndirectHours, setAddIndirectHours] = useState('')
  const [addIndirectRate, setAddIndirectRate] = useState('')

  // State for the "missing activities" repair flow
  const [syncingActivities, setSyncingActivities] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // State for the "fix unmatched timesheet entries" repair flow
  const [syncingEntries, setSyncingEntries] = useState(false)
  const [syncEntriesError, setSyncEntriesError] = useState<string | null>(null)
  const [syncEntriesResult, setSyncEntriesResult] = useState<{
    fixedCount: number
    ambiguousCount: number
    noCandidateCount: number
  } | null>(null)

  // State for the "Reassign manually" modal — used when the auto fuzzy match
  // can't pick a candidate for some unmatched entries (status = no_candidate
  // or ambiguous). The budget owner picks the correct (system, deliverable,
  // activity) cell for each entry; the modal POSTs them to
  // /api/budget/[poId]/sync-timesheet-entries with an `assignments` payload,
  // which validates each combo against project_details and updates the FKs.
  type UnmatchedEntry = {
    entryId: string
    timesheetId: string | null
    userId: string | null
    userName: string
    weekEnding: string | null
    hours: number
    systemId: string | null
    deliverableId: string | null
    activityId: string | null
    systemName: string | null
    systemCode: string | null
    deliverableName: string | null
    activityName: string | null
  }
  type ValidCombo = {
    systemId: string
    deliverableId: string
    activityId: string
    systemName: string
    systemCode: string | null
    deliverableName: string
    activityName: string
  }
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignLoading, setReassignLoading] = useState(false)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [reassignSaving, setReassignSaving] = useState(false)
  const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedEntry[]>([])
  const [validCombos, setValidCombos] = useState<ValidCombo[]>([])
  // Per-entry user picks. `systemLabel` is the deduped display label for the
  // system (multiple underlying system rows that share a name collapse into one
  // pickable entry). The actual concrete `system_id` is resolved on save from
  // the picked deliverable's parent.
  const [reassignPicks, setReassignPicks] = useState<
    Record<string, { systemLabel: string; deliverableId: string; activityId: string }>
  >({})

  const bumpRefresh = () => onMatrixRefresh?.()

  // Tracks POs we've already attempted a one-shot auto-link on this mount so we
  // don't loop. Auto-link silently runs the safe fuzzy-match repair so budget
  // owners rarely need the manual "Reassign" step (#13).
  const autoLinkAttempted = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const fetchMatrix = async () => {
      const res = await fetch(`/api/budget/${poId}/project-matrix`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || `Could not load matrix (${res.status})`)
      }
      return (await res.json()) as MatrixPayload
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        let json = await fetchMatrix()
        if (!cancelled) setData(json)

        // Auto-link: when this budget owner can edit and there are unmatched
        // timesheet hours, run the safe fuzzy-match once and reload so single
        // safe candidates snap onto their matrix cell without a manual step.
        if (
          !cancelled &&
          canEditMatrix &&
          (json.totals?.unmatchedActualHours || 0) > 0 &&
          !autoLinkAttempted.current.has(poId)
        ) {
          autoLinkAttempted.current.add(poId)
          try {
            const fixRes = await fetch(`/api/budget/${poId}/sync-timesheet-entries`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
            const fixBody = await fixRes.json().catch(() => ({}))
            if (fixRes.ok && (Number((fixBody as { fixedCount?: number }).fixedCount) || 0) > 0) {
              json = await fetchMatrix()
              if (!cancelled) setData(json)
            }
          } catch {
            /* best-effort; manual Reassign remains available */
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load project matrix')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poId, refreshTick, canEditMatrix])

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
  const missingActivities = data?.missingActivities ?? []
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

  const openEdit = async (r: MatrixRow) => {
    setMutateError(null)
    setEditingRow(r)
    setEditBudget(String(r.budgetedHours))
    setEditBillRate(r.billRate != null ? String(r.billRate) : '')
    setEditDesc((r.description ?? '') || '')
    // Reset cascading picks; we hydrate them once validCombos has loaded so
    // the dropdowns can display the row's current combo as the initial value.
    setEditSystemLabel('')
    setEditDeliverableId('')
    setEditActivityId('')
    setEditCombosError(null)
    // Fetch valid combos for this PO if we don't already have them (the
    // Reassign dialog may have already populated them). This is what the
    // cascading dropdowns use as their option source.
    if (validCombos.length === 0) {
      setEditCombosLoading(true)
      try {
        const res = await fetch(`/api/budget/${poId}/unmatched-entries`, {
          credentials: 'include',
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          const payload = body as { unmatched: UnmatchedEntry[]; validCombos: ValidCombo[] }
          setValidCombos(payload.validCombos || [])
        } else {
          setEditCombosError((body as { error?: string }).error || 'Failed to load combos')
        }
      } catch (e) {
        setEditCombosError(e instanceof Error ? e.message : 'Failed to load combos')
      } finally {
        setEditCombosLoading(false)
      }
    }
  }

  // Once validCombos is available, pre-fill the Edit matrix row dropdowns to
  // match the row currently being edited. We only seed empty fields so the
  // user's in-flight picks aren't overwritten if they edit, blur, and re-open.
  useEffect(() => {
    if (!editingRow) return
    if (validCombos.length === 0) return
    if (editSystemLabel || editDeliverableId || editActivityId) return
    // Prefer matching on the row's concrete FK ids. Matching by *name* is
    // ambiguous when a PO has duplicate-named deliverables/activities (e.g. two
    // "Dynamic Final Report" deliverables with different ids): it would seed the
    // dropdowns with the WRONG deliverable/activity id, so a later save that
    // only touched hours/rate would silently re-point the row onto another
    // row's combo and trip the unique constraint. Using ids avoids that.
    const byId =
      editingRow.systemId && editingRow.deliverableId && editingRow.activityId
        ? validCombos.find(
            (c) =>
              c.systemId === editingRow.systemId &&
              c.deliverableId === editingRow.deliverableId &&
              c.activityId === editingRow.activityId
          )
        : undefined
    // Fallback (older payloads without ids): match by name as before.
    const stripCode = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const rowSysName = stripCode(editingRow.systemLabel)
    const match =
      byId ||
      validCombos.find(
        (c) =>
          c.systemName.trim().toLowerCase() === rowSysName.toLowerCase() &&
          c.deliverableName === editingRow.deliverableName &&
          c.activityName === editingRow.activityName
      )
    if (match) {
      setEditSystemLabel(match.systemName.trim())
      setEditDeliverableId(match.deliverableId)
      setEditActivityId(match.activityId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRow, validCombos])

  const handleSaveEdit = async () => {
    if (!editingRow) return
    setMutating(true)
    setMutateError(null)
    try {
      const payload: Record<string, unknown> = {
        id: editingRow.id,
        budgeted_hours: Number(editBudget) || 0,
        bill_rate: editBillRate.trim() === '' ? null : Number(editBillRate),
        description: editDesc.trim() || null,
      }
      // Only send the (system, deliverable, activity) combo when the user
      // actually re-pointed the row. Comparing against the row's original ids
      // means a plain hours/rate/description edit never touches the combo — so
      // it can't collide with another row's combo (the unique-constraint error
      // users were hitting). The system_id is resolved from the picked
      // deliverable (the same dedup model used in the Reassign dialog).
      if (editSystemLabel && editDeliverableId && editActivityId) {
        const resolvedSystemId = resolveSystemIdForPick(editSystemLabel, editDeliverableId, editActivityId)
        if (!resolvedSystemId) {
          setMutateError('Could not resolve the picked combo on this PO. Refresh and try again.')
          setMutating(false)
          return
        }
        const comboChanged =
          resolvedSystemId !== editingRow.systemId ||
          editDeliverableId !== editingRow.deliverableId ||
          editActivityId !== editingRow.activityId
        if (comboChanged) {
          payload.system_id = resolvedSystemId
          payload.deliverable_id = editDeliverableId
          payload.activity_id = editActivityId
        }
      }
      const res = await fetch(`/api/budget/${poId}/project-details`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
   * editing rows backed by a real po_expenses record.
   */
  const startEditIndirect = (ir: IndirectLineRow) => {
    if (ir.source === 'bidsheet_fallback') return
    setEditingIndirect(ir)
    setEditIndirectLabel(ir.label || '')
    // Real po_expenses store the amount as actualCost; fallback rows use budgetCost.
    setEditIndirectAmount(String(ir.source === 'po_expense' ? (ir.actualCost ?? 0) : (ir.budgetCost ?? 0)))
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
   * Delete an indirect / PO-expense line straight from the matrix view.
   * Fallback bid-sheet rows (source==='bidsheet_fallback') are not deletable — the
   * user should instead record a real expense via "Record Expense" or sync activities.
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

  /**
   * Convert a bid-sheet fallback expense row into a real po_expense so the user
   * gets Edit / Delete buttons. Prefills label and amount from the projection.
   */
  const handleRecordExpense = async (ir: IndirectLineRow) => {
    if (!confirm(`Record "${ir.label}" as a tracked expense on this PO?\n\nThis will create a real expense entry for $${ir.budgetCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} that you can then edit or delete.`)) return
    setMutating(true)
    setMutateError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/budget/${poId}/expenses`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_type_name: ir.label,
          amount: ir.budgetCost,
          expense_date: today,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to record expense')
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Failed to record expense')
    } finally {
      setMutating(false)
    }
  }

  /**
   * Call the repair endpoint to add any activity-type indirect rows (PM, DocCoord, etc.)
   * that are missing from project_details (usually because the PO was converted before
   * the activity-type logic was added).
   */
  const handleSyncActivities = async () => {
    setSyncingActivities(true)
    setSyncError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/sync-indirect-activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Sync failed')
      bumpRefresh()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncingActivities(false)
    }
  }

  /**
   * One-click repair for timesheet entries on this PO that don't match a
   * matrix row. The repair endpoint fuzzy-matches each unmatched entry's
   * (system, deliverable, activity) against project_details rows and updates
   * the entry's IDs when exactly one project_details candidate is found.
   * Common cause: site has duplicate deliverables ("SLIA" vs "System Level
   * Impact Assessment (SLIA)") and the timesheet picked the orphan one.
   */
  const handleSyncTimesheetEntries = async () => {
    setSyncingEntries(true)
    setSyncEntriesError(null)
    setSyncEntriesResult(null)
    try {
      const res = await fetch(`/api/budget/${poId}/sync-timesheet-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Sync failed')
      const result = body as {
        fixedCount: number
        ambiguousCount: number
        noCandidateCount: number
      }
      setSyncEntriesResult({
        fixedCount: Number(result.fixedCount) || 0,
        ambiguousCount: Number(result.ambiguousCount) || 0,
        noCandidateCount: Number(result.noCandidateCount) || 0,
      })
      bumpRefresh()
    } catch (e) {
      setSyncEntriesError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncingEntries(false)
    }
  }

  /**
   * Open the "Reassign manually" modal. Fetches the list of unmatched entries
   * on this PO (entries whose triplet doesn't exist in project_details) plus
   * the catalog of valid combos so the dropdowns are restricted to real
   * matrix cells.
   */
  const handleOpenReassign = async () => {
    setReassignOpen(true)
    setReassignLoading(true)
    setReassignError(null)
    setUnmatchedEntries([])
    setValidCombos([])
    setReassignPicks({})
    try {
      const res = await fetch(`/api/budget/${poId}/unmatched-entries`, {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to load')
      const payload = body as { unmatched: UnmatchedEntry[]; validCombos: ValidCombo[] }
      setUnmatchedEntries(payload.unmatched || [])
      setValidCombos(payload.validCombos || [])
      // Pre-seed picks with empty selections for each entry so we can render
      // the dropdowns in a controlled way.
      const seed: Record<string, { systemLabel: string; deliverableId: string; activityId: string }> = {}
      for (const e of payload.unmatched || []) {
        seed[e.entryId] = { systemLabel: '', deliverableId: '', activityId: '' }
      }
      setReassignPicks(seed)
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setReassignLoading(false)
    }
  }

  const handleCloseReassign = () => {
    if (reassignSaving) return
    setReassignOpen(false)
    setReassignError(null)
  }

  /**
   * Build cascading dropdown options from validCombos for a given entry's
   * current picks.
   *
   * - The System list collapses systems that share a display label (e.g. three
   *   distinct system rows all named "Indirect" appear once). The picked value
   *   is the display label, not a concrete system_id.
   * - The Deliverable list shows every deliverable belonging to ANY underlying
   *   system that matches the picked label. Each option carries a subtext
   *   showing the parent system's code (or system name when no code exists)
   *   so visually-identical deliverable names can still be told apart.
   * - The Activity list narrows to activities valid for the picked
   *   deliverable. (Because a deliverable_id is tied to exactly one system_id
   *   in validCombos, the picked deliverable also uniquely determines the
   *   concrete system_id used on save.)
   */
  const systemLabelFor = useCallback((c: ValidCombo) => {
    // Display label used to group duplicate-named systems. We use the bare
    // name (case-insensitive grouping) so e.g. three "Indirect" rows collapse;
    // the code is intentionally NOT part of the grouping key.
    return c.systemName.trim()
  }, [])

  const reassignSystemOptions = useMemo(() => {
    const seen = new Map<string, { systemLabel: string; label: string }>()
    for (const c of validCombos) {
      const key = systemLabelFor(c).toLowerCase()
      if (seen.has(key)) continue
      seen.set(key, { systemLabel: systemLabelFor(c), label: systemLabelFor(c) })
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
  }, [validCombos, systemLabelFor])

  const getDeliverableOptions = useCallback(
    (systemLabel: string) => {
      if (!systemLabel) {
        return [] as Array<{ deliverableId: string; label: string; subtext: string }>
      }
      const wanted = systemLabel.trim().toLowerCase()
      const seen = new Map<string, { deliverableId: string; label: string; subtext: string }>()
      for (const c of validCombos) {
        if (systemLabelFor(c).toLowerCase() !== wanted) continue
        if (seen.has(c.deliverableId)) continue
        // Subtext disambiguates which underlying "Indirect" (or other
        // duplicate-named system) a deliverable belongs to. Prefer the
        // system code when available; fall back to the system name.
        const subtext = c.systemCode || c.systemName
        seen.set(c.deliverableId, {
          deliverableId: c.deliverableId,
          label: c.deliverableName,
          subtext,
        })
      }
      return Array.from(seen.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      )
    },
    [validCombos, systemLabelFor]
  )

  const getActivityOptions = useCallback(
    (deliverableId: string) => {
      if (!deliverableId) return [] as Array<{ activityId: string; label: string }>
      const seen = new Map<string, { activityId: string; label: string }>()
      for (const c of validCombos) {
        if (c.deliverableId !== deliverableId) continue
        if (seen.has(c.activityId)) continue
        seen.set(c.activityId, { activityId: c.activityId, label: c.activityName })
      }
      return Array.from(seen.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      )
    },
    [validCombos]
  )

  /**
   * Given a picked (systemLabel, deliverableId, activityId), return the concrete
   * system_id that this combo belongs to. The systemLabel is required to
   * disambiguate: the SAME deliverable+activity pair can belong to more than one
   * system (e.g. "Dynamic Final Report / Approval" exists under both AVS and
   * EMPV), so matching on deliverable+activity alone would pick the wrong
   * system_id and re-point the row onto another system's combo.
   */
  const resolveSystemIdForPick = useCallback(
    (systemLabel: string, deliverableId: string, activityId: string): string | null => {
      const wantedSys = systemLabel.trim().toLowerCase()
      for (const c of validCombos) {
        if (
          systemLabelFor(c).toLowerCase() === wantedSys &&
          c.deliverableId === deliverableId &&
          c.activityId === activityId
        ) {
          return c.systemId
        }
      }
      return null
    },
    [validCombos, systemLabelFor]
  )

  const setReassignPick = (
    entryId: string,
    field: 'systemLabel' | 'deliverableId' | 'activityId',
    value: string
  ) => {
    setReassignPicks((prev) => {
      const cur = prev[entryId] || { systemLabel: '', deliverableId: '', activityId: '' }
      const next = { ...cur, [field]: value }
      // Clear downstream selections when an upstream pick changes so the
      // user can't end up with an inconsistent (system, deliverable, activity)
      // triplet via a stale dropdown value.
      if (field === 'systemLabel') {
        next.deliverableId = ''
        next.activityId = ''
      } else if (field === 'deliverableId') {
        next.activityId = ''
      }
      return { ...prev, [entryId]: next }
    })
  }

  /**
   * POST the chosen assignments to /api/budget/[poId]/sync-timesheet-entries.
   * Only entries where all three fields are filled are submitted; the rest
   * are left for the user to come back to.
   */
  const handleSaveReassign = async () => {
    // The user picks a deduped systemLabel + deliverableId + activityId. The
    // concrete system_id is resolved from the chosen deliverable's parent
    // (deliverable IDs are unique to one system_id in validCombos).
    const assignments: Array<{
      entryId: string
      systemId: string
      deliverableId: string
      activityId: string
    }> = []
    for (const [entryId, p] of Object.entries(reassignPicks)) {
      if (!p.systemLabel || !p.deliverableId || !p.activityId) continue
      const systemId = resolveSystemIdForPick(p.systemLabel, p.deliverableId, p.activityId)
      if (!systemId) continue
      assignments.push({
        entryId,
        systemId,
        deliverableId: p.deliverableId,
        activityId: p.activityId,
      })
    }
    if (assignments.length === 0) {
      setReassignError('Pick a system, deliverable, and activity for at least one entry first.')
      return
    }
    setReassignSaving(true)
    setReassignError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/sync-timesheet-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Save failed')
      const result = body as {
        updatedCount: number
        invalidComboCount: number
        notOnPoCount: number
        errorCount: number
      }
      // Refresh the unmatched list — saved entries should drop off; any with
      // errors stay so the user can fix them.
      const refreshed = await fetch(`/api/budget/${poId}/unmatched-entries`, {
        credentials: 'include',
      })
      const refreshedBody = await refreshed.json().catch(() => ({}))
      const payload = refreshedBody as { unmatched?: UnmatchedEntry[] }
      const remaining = payload.unmatched || []
      setUnmatchedEntries(remaining)
      // Trim picks to only entries that are still unmatched
      setReassignPicks((prev) => {
        const next: typeof prev = {}
        for (const e of remaining) next[e.entryId] = prev[e.entryId] || { systemLabel: '', deliverableId: '', activityId: '' }
        return next
      })
      bumpRefresh()
      if (
        result.invalidComboCount + result.notOnPoCount + result.errorCount > 0
      ) {
        setReassignError(
          `Saved ${result.updatedCount}. Some assignments were rejected — invalid combo: ${result.invalidComboCount}, not on PO: ${result.notOnPoCount}, errors: ${result.errorCount}.`
        )
      } else if (remaining.length === 0) {
        setReassignOpen(false)
      }
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setReassignSaving(false)
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
          bill_rate: addBillRate.trim() === '' ? null : Number(addBillRate),
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
      setAddBillRate('')
      setAddDesc('')
      setShowAddRow(false)
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Could not add row')
    } finally {
      setMutating(false)
    }
  }

  const handleAddIndirect = async () => {
    const label = addIndirectLabel.trim()
    if (!label) {
      setMutateError('Name is required')
      return
    }
    setMutating(true)
    setMutateError(null)
    try {
      if (addIndirectType === 'expense') {
        const amt = Number(addIndirectAmount)
        if (!Number.isFinite(amt) || amt < 0) {
          setMutateError('Amount must be a non-negative number')
          setMutating(false)
          return
        }
        const today = new Date().toISOString().slice(0, 10)
        const res = await fetch(`/api/budget/${poId}/expenses`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_type_name: label, amount: amt, expense_date: today }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not add indirect cost')
      } else {
        // Loggable activity → Indirect / Indirect / <name> matrix row.
        const res = await fetch(`/api/budget/${poId}/project-details`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_name: 'Indirect',
            deliverable_name: 'Indirect',
            activity_name: label,
            budgeted_hours: Number(addIndirectHours) || 0,
            bill_rate: addIndirectRate.trim() === '' ? null : Number(addIndirectRate),
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not add indirect cost')
      }
      setAddIndirectLabel('')
      setAddIndirectAmount('')
      setAddIndirectHours('')
      setAddIndirectRate('')
      setShowAddIndirect(false)
      bumpRefresh()
    } catch (e) {
      setMutateError(e instanceof Error ? e.message : 'Could not add indirect cost')
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
      {/* Inline tabs — matrix / by-system / by-individual. Hidden in print so
          exports don't carry the navigation. The active tab is mirrored to a
          ?tab= query param so refreshes / direct links land on the right
          view. Project budget only — basic budgets short-circuit before this
          component renders. */}
      <div className="mb-4 print:hidden -mt-2 -mx-2 px-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-1 overflow-x-auto">
        {(
          [
            { key: 'matrix', label: 'Project matrix' },
            { key: 'by-system', label: 'By system' },
            { key: 'by-individual', label: 'By individual' },
          ] as Array<{ key: ProjectBudgetTab; label: string }>
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
            aria-current={activeTab === t.key ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'by-system' && (
        <ProjectBySystemView
          poId={poId}
          refreshTick={refreshTick}
          reportTitle={reportTitle}
          fileBaseName={fileBaseName}
          canEditMatrix={canEditMatrix}
          onMatrixRefresh={onMatrixRefresh}
        />
      )}

      {activeTab === 'by-individual' && (
        <ProjectByIndividualView
          poId={poId}
          refreshTick={refreshTick}
          reportTitle={reportTitle}
          fileBaseName={fileBaseName}
        />
      )}

      {activeTab === 'matrix' && (
      <>
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
          {canEditMatrix && (
            <button
              type="button"
              onClick={() => {
                setMutateError(null)
                setShowAddIndirect((v) => !v)
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              {showAddIndirect ? 'Hide indirect' : 'Add indirect cost'}
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

      {canEditMatrix && missingActivities.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Loggable activities not yet in the matrix</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              {missingActivities.map((a) => a.activityName).join(', ')} —{' '}
              {missingActivities.length === 1 ? 'this activity was' : 'these activities were'} set as loggable in the bid sheet
              but {missingActivities.length === 1 ? 'is' : 'are'} missing from the project matrix (the PO may have been converted before
              activity-type tracking was available). Click <strong>Add to Matrix</strong> to add{' '}
              {missingActivities.length === 1 ? 'it' : 'them'} with their bid-sheet budgeted hours.
            </p>
            {syncError && <p className="mt-1 text-red-600 dark:text-red-400">{syncError}</p>}
          </div>
          <button
            type="button"
            onClick={handleSyncActivities}
            disabled={syncingActivities}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {syncingActivities ? 'Adding…' : 'Add to Matrix'}
          </button>
        </div>
      )}

      {data && data.totals.unmatchedActualHours > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">
              {formatHours(data.totals.unmatchedActualHours)} timesheet hours don&apos;t match a matrix row
            </p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              These hours were logged against a system / deliverable / activity combination that doesn&apos;t exist as a project matrix cell —
              usually because the timesheet picked a duplicate deliverable or activity (e.g. <em>SLIA</em> vs <em>System Level Impact Assessment (SLIA)</em>).
              {canEditMatrix
                ? <> Click <strong>Fix Entries</strong> to auto-remap each entry to the matching matrix cell when there&apos;s a single safe candidate.</>
                : ' Ask an admin to repair these entries from the budget detail page.'}
            </p>
            {syncEntriesError && <p className="mt-1 text-red-600 dark:text-red-400">{syncEntriesError}</p>}
            {syncEntriesResult && (
              <p className="mt-1 text-amber-900 dark:text-amber-100">
                Repaired {syncEntriesResult.fixedCount} entr{syncEntriesResult.fixedCount === 1 ? 'y' : 'ies'}
                {syncEntriesResult.ambiguousCount > 0 && (
                  <> · {syncEntriesResult.ambiguousCount} ambiguous (multiple matches — left alone)</>
                )}
                {syncEntriesResult.noCandidateCount > 0 && (
                  <> · {syncEntriesResult.noCandidateCount} with no matching matrix cell (need to be edited or re-logged)</>
                )}
                .
              </p>
            )}
          </div>
          {canEditMatrix && (
            <div className="shrink-0 flex flex-col gap-2 items-stretch">
              <button
                type="button"
                onClick={handleSyncTimesheetEntries}
                disabled={syncingEntries || reassignSaving}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {syncingEntries ? 'Fixing…' : 'Fix Entries'}
              </button>
              <button
                type="button"
                onClick={handleOpenReassign}
                disabled={syncingEntries || reassignSaving}
                title="Pick the right matrix cell for each unmatched entry"
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-amber-600 text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
              >
                Reassign manually
              </button>
            </div>
          )}
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
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Bill rate ($/hr)
              <input
                type="number"
                min={0}
                step="0.01"
                value={addBillRate}
                onChange={(e) => setAddBillRate(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                placeholder="Budget cost = budget h × rate"
              />
              <span className="mt-1 block font-normal text-[11px] text-gray-500 dark:text-gray-400">
                Optional. Blank uses the PO&apos;s blended rate. Budget $ = budget h × rate.
              </span>
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

      {canEditMatrix && showAddIndirect && (
        <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 print:hidden space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add indirect cost</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adds an indirect line to this project budget. An <strong>Expense</strong> tracks a dollar amount (e.g. Travel &amp; Living); a <strong>Loggable activity</strong> creates an Indirect line people can log time against (budget $ = hours × rate).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Type
              <select
                value={addIndirectType}
                onChange={(e) => setAddIndirectType(e.target.value as 'expense' | 'activity')}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="expense">Expense</option>
                <option value="activity">Loggable activity</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:col-span-1 lg:col-span-3">
              Name / category *
              <input
                value={addIndirectLabel}
                onChange={(e) => setAddIndirectLabel(e.target.value)}
                className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                placeholder="e.g. Project Management or Travel &amp; Living (FAT)"
              />
            </label>
            {addIndirectType === 'expense' ? (
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Amount ($)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={addIndirectAmount}
                  onChange={(e) => setAddIndirectAmount(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                />
              </label>
            ) : (
              <>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Budget (h)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addIndirectHours}
                    onChange={(e) => setAddIndirectHours(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Bill rate ($/hr)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addIndirectRate}
                    onChange={(e) => setAddIndirectRate(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="mt-1 w-full h-9 px-2 border rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  />
                </label>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={mutating || !addIndirectLabel.trim()}
              onClick={handleAddIndirect}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save indirect cost
            </button>
            <button type="button" onClick={() => setShowAddIndirect(false)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600">
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
                // Fallback rows are bid-sheet projections (no real po_expense yet).
                // Real po_expense rows (source === 'po_expense') get Edit / Delete.
                const isFallbackRow = ir.source === 'bidsheet_fallback'
                return (
                  <tr key={`indirect-${ir.id}`} className="border-b border-gray-100 dark:border-gray-700 bg-amber-50/40 dark:bg-amber-950/15">
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top">Indirect</td>
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-200 align-top" title={ir.label}>
                      {ir.label}
                      {isFallbackRow && (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">(bid-sheet projection)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-500 align-top">—</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-500 align-top max-w-[220px] text-xs">
                      {isFallbackRow ? 'Projected (bid sheet)' : 'PO expense'}
                    </td>
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
                          <button
                            type="button"
                            onClick={() => handleRecordExpense(ir)}
                            disabled={mutating}
                            title="Create a tracked expense entry from this bid-sheet projection so you can edit or delete it"
                            className="text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                          >
                            Record Expense
                          </button>
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
                Adjust the System / Deliverable / Activity this row points to (restricted to combos that already exist on this PO),
                or update the budget hours and description. Existing approved timesheet entries on the prior combo are left as-is and may surface as
                unmatched until reassigned.
              </p>
              {editCombosLoading && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Loading options…</p>
              )}
              {editCombosError && (
                <p className="text-xs text-red-600 dark:text-red-400">{editCombosError}</p>
              )}
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">System</span>
                <select
                  value={editSystemLabel}
                  onChange={(ev) => {
                    setEditSystemLabel(ev.target.value)
                    // Clear downstream picks when the system changes.
                    setEditDeliverableId('')
                    setEditActivityId('')
                  }}
                  disabled={mutating || editCombosLoading}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="">Select…</option>
                  {reassignSystemOptions.map((o) => (
                    <option key={o.systemLabel} value={o.systemLabel}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Deliverable</span>
                <select
                  value={editDeliverableId}
                  onChange={(ev) => {
                    setEditDeliverableId(ev.target.value)
                    setEditActivityId('')
                  }}
                  disabled={mutating || editCombosLoading || !editSystemLabel}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm disabled:opacity-50"
                >
                  <option value="">Select…</option>
                  {getDeliverableOptions(editSystemLabel).map((o) => (
                    <option key={o.deliverableId} value={o.deliverableId}>
                      {o.subtext ? `${o.label} (${o.subtext})` : o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Activity</span>
                <select
                  value={editActivityId}
                  onChange={(ev) => setEditActivityId(ev.target.value)}
                  disabled={mutating || editCombosLoading || !editDeliverableId}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm disabled:opacity-50"
                >
                  <option value="">Select…</option>
                  {getActivityOptions(editDeliverableId).map((o) => (
                    <option key={o.activityId} value={o.activityId}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Budget (h)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Bill rate ($/hr)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editBillRate}
                  onChange={(e) => setEditBillRate(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  placeholder={
                    editingRow?.effectiveBudgetRate
                      ? `Default: ${editingRow.effectiveBudgetRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'Blank uses blended rate'
                  }
                />
                <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">
                  Budget $ = budget h × rate. Blank falls back to the bid/blended rate.
                </span>
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
              {mutateError && (
                <p className="text-xs text-red-600 dark:text-red-400">{mutateError}</p>
              )}
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

      {/* Reassign manually modal — used when the auto fuzzy match can't pick
          a target (no_candidate / ambiguous). The budget owner picks a real
          matrix cell for each unmatched entry from cascading dropdowns
          restricted to project_details combos for this PO. Saving updates
          the entry FKs in the DB so the matrix view AND the CSV export
          immediately reflect the corrected combo. */}
      {reassignOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseReassign}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Reassign timesheet entries</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Pick the matrix cell each entry should land on. Dropdowns are restricted to
                  (system, deliverable, activity) combos that exist on this PO. Saving updates
                  the entry directly — the matrix and CSV export will reflect the new cell.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseReassign}
                disabled={reassignSaving}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3">
              {reassignLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : unmatchedEntries.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No unmatched timesheet entries on this PO.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      <th className="text-left py-2 pr-2 font-medium">Employee</th>
                      <th className="text-left py-2 pr-2 font-medium">Week</th>
                      <th className="text-right py-2 pr-2 font-medium">Hrs</th>
                      <th className="text-left py-2 pr-2 font-medium">Currently logged as</th>
                      <th className="text-left py-2 pr-2 font-medium">New System</th>
                      <th className="text-left py-2 pr-2 font-medium">New Deliverable</th>
                      <th className="text-left py-2 pr-2 font-medium">New Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedEntries.map((e) => {
                      const pick = reassignPicks[e.entryId] || { systemLabel: '', deliverableId: '', activityId: '' }
                      const delOptions = getDeliverableOptions(pick.systemLabel)
                      const actOptions = getActivityOptions(pick.deliverableId)
                      const currentLabel =
                        [e.systemName, e.deliverableName, e.activityName]
                          .filter(Boolean)
                          .join(' / ') || '(blank)'
                      return (
                        <tr key={e.entryId} className="border-b border-gray-100 dark:border-gray-700/50 align-top">
                          <td className="py-2 pr-2 text-gray-900 dark:text-gray-100">{e.userName || '—'}</td>
                          <td className="py-2 pr-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {e.weekEnding ? e.weekEnding.slice(0, 10) : '—'}
                          </td>
                          <td className="py-2 pr-2 text-right text-gray-900 dark:text-gray-100">
                            {e.hours.toFixed(2)}
                          </td>
                          <td className="py-2 pr-2 text-gray-600 dark:text-gray-400 max-w-[16rem]">
                            <span title={currentLabel} className="line-clamp-2">{currentLabel}</span>
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={pick.systemLabel}
                              onChange={(ev) => setReassignPick(e.entryId, 'systemLabel', ev.target.value)}
                              disabled={reassignSaving}
                              className="w-full h-8 px-1 border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                            >
                              <option value="">Select…</option>
                              {reassignSystemOptions.map((o) => (
                                <option key={o.systemLabel} value={o.systemLabel}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={pick.deliverableId}
                              onChange={(ev) => setReassignPick(e.entryId, 'deliverableId', ev.target.value)}
                              disabled={reassignSaving || !pick.systemLabel}
                              className="w-full h-8 px-1 border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs disabled:opacity-50"
                            >
                              <option value="">Select…</option>
                              {delOptions.map((o) => (
                                <option key={o.deliverableId} value={o.deliverableId}>
                                  {o.subtext ? `${o.label} (${o.subtext})` : o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={pick.activityId}
                              onChange={(ev) => setReassignPick(e.entryId, 'activityId', ev.target.value)}
                              disabled={reassignSaving || !pick.deliverableId}
                              className="w-full h-8 px-1 border rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs disabled:opacity-50"
                            >
                              <option value="">Select…</option>
                              {actOptions.map((o) => (
                                <option key={o.activityId} value={o.activityId}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {reassignError && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400">{reassignError}</p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Picked:{' '}
                {Object.values(reassignPicks).filter(
                  (p) => p.systemLabel && p.deliverableId && p.activityId
                ).length}{' '}
                of {unmatchedEntries.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCloseReassign}
                  disabled={reassignSaving}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveReassign}
                  disabled={
                    reassignSaving ||
                    reassignLoading ||
                    Object.values(reassignPicks).filter(
                      (p) => p.systemLabel && p.deliverableId && p.activityId
                    ).length === 0
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {reassignSaving ? 'Saving…' : 'Save assignments'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
