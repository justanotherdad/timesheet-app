'use client'

/**
 * "By system" tab on the Project Budget screen.
 *
 * Renders a responsive card grid (1 col on mobile, 2 cols on md+) — one card
 * per real system on the PO. Each card shows the system-level Earned Value
 * Management rollup (Budget, ETC, EV) and a Details button.
 *
 * The Details modal expands a single system into its Deliverable → Activity
 * tree, with the four-row Budget / Actual / ETC / EV+CPI+Status% breakdown
 * per activity. Status % is editable for managers/admins+; clearing the
 * field reverts the cell to the auto-computed status.
 *
 * Clicking the Actual cost dollar amount on an activity row opens a nested
 * "Cell Detail" popup listing each (week_ending, employee, hours, cost) that
 * makes up that actual; rows link to the source timesheet in a new tab.
 *
 * Indirect rows (Project Management / Doc Coordinator / Project Controls /
 * etc.) are excluded from the card grid but still roll into the project
 * total at the bottom of the page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Printer, RefreshCcw } from 'lucide-react'
import { formatHours } from '@/lib/utils'

type EvmCellResult = {
  budgetHours: number
  budgetCost: number
  actualHours: number
  actualCost: number
  statusPct: number
  isManualStatus: boolean
  autoStatusPct: number
  etcHours: number
  etcCost: number
  ev: number
  cpi: number | null
}

type ActivityNode = {
  detailId: string
  activityId: string
  activityName: string
  description: string | null
  manualStatusPct: number | null
  evm: EvmCellResult
  isIndirect: boolean
}

type DeliverableNode = {
  deliverableId: string
  deliverableName: string
  rollup: EvmCellResult
  activities: ActivityNode[]
}

type SystemNode = {
  systemId: string
  systemName: string
  systemCode: string | null
  rollup: EvmCellResult
  deliverables: DeliverableNode[]
}

type BySystemPayload = {
  blendedRate: number
  systems: SystemNode[]
  indirectTotal: EvmCellResult
  projectTotal: EvmCellResult
}

type CellDetailRow = {
  timesheetId: string
  weekEnding: string
  userId: string
  userName: string
  hours: number
  cost: number
}

type ProjectBySystemViewProps = {
  poId: string
  refreshTick: number
  reportTitle?: string
  fileBaseName?: string
  canEditMatrix?: boolean
  onMatrixRefresh?: () => void
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (frac: number) => `${(frac * 100).toFixed(1)}%`
const fmtCpi = (cpi: number | null) => (cpi == null ? '—' : cpi.toFixed(2))

export default function ProjectBySystemView({
  poId,
  refreshTick,
  reportTitle,
  fileBaseName,
  canEditMatrix = false,
  onMatrixRefresh,
}: ProjectBySystemViewProps) {
  const [data, setData] = useState<BySystemPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openSystemId, setOpenSystemId] = useState<string | null>(null)
  // Local edits to the Status % per detailId so typing feels snappy. Saves
  // happen on blur or Enter; the API call clears the local entry on success.
  const [localStatusByDetail, setLocalStatusByDetail] = useState<Record<string, string>>({})
  const [savingDetailId, setSavingDetailId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Per-cell "Actual" popup state
  const [cellDetailOpenForDetailId, setCellDetailOpenForDetailId] = useState<string | null>(null)
  const [cellDetailLabel, setCellDetailLabel] = useState<string>('')
  const [cellDetailLoading, setCellDetailLoading] = useState(false)
  const [cellDetailError, setCellDetailError] = useState<string | null>(null)
  const [cellDetailRows, setCellDetailRows] = useState<CellDetailRow[]>([])
  const [cellDetailTotals, setCellDetailTotals] = useState<{ hours: number; cost: number }>({
    hours: 0,
    cost: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/budget/${poId}/by-system`, { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      setData(body as BySystemPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => {
    load()
  }, [load, refreshTick])

  const openSystem = useMemo(
    () => (openSystemId ? data?.systems.find((s) => s.systemId === openSystemId) ?? null : null),
    [openSystemId, data]
  )

  /**
   * Save a Status % override to the API. Accepts a percent (0..100) string;
   * empty string means "clear override → auto". Optimistically updates the
   * activity in local state so the EV / ETC / system rollups recompute on
   * the next refresh. We trigger a parent refresh too so the matrix tab
   * stays in sync.
   */
  const saveStatusPct = async (detailId: string, raw: string) => {
    setStatusError(null)
    setSavingDetailId(detailId)
    try {
      let payload: { id: string; status_pct: number | null }
      if (raw.trim() === '') {
        payload = { id: detailId, status_pct: null }
      } else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error('Status % must be between 0 and 100')
        }
        payload = { id: detailId, status_pct: n }
      }
      const res = await fetch(`/api/budget/${poId}/project-details`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Save failed')
      setLocalStatusByDetail((prev) => {
        const next = { ...prev }
        delete next[detailId]
        return next
      })
      await load()
      onMatrixRefresh?.()
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingDetailId(null)
    }
  }

  /** Open the per-cell Actual breakdown popup. */
  const openCellDetail = async (
    detailId: string,
    deliverableName: string,
    activityName: string
  ) => {
    setCellDetailOpenForDetailId(detailId)
    setCellDetailLabel(`${deliverableName} → ${activityName}`)
    setCellDetailLoading(true)
    setCellDetailError(null)
    setCellDetailRows([])
    setCellDetailTotals({ hours: 0, cost: 0 })
    try {
      const res = await fetch(`/api/budget/${poId}/cell-detail?detailId=${encodeURIComponent(detailId)}`, {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to load')
      const payload = body as { rows: CellDetailRow[]; totals: { hours: number; cost: number } }
      setCellDetailRows(payload.rows || [])
      setCellDetailTotals(payload.totals || { hours: 0, cost: 0 })
    } catch (e) {
      setCellDetailError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setCellDetailLoading(false)
    }
  }

  const closeCellDetail = () => {
    setCellDetailOpenForDetailId(null)
    setCellDetailLabel('')
    setCellDetailRows([])
    setCellDetailTotals({ hours: 0, cost: 0 })
    setCellDetailError(null)
  }

  const exportCsv = () => {
    if (!data) return
    const q = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`
    const headers = [
      'System', 'System Code', 'Deliverable', 'Activity',
      'Budget Hours', 'Actual Hours', 'ETC Hours',
      'Budget $', 'Actual $', 'ETC $',
      'EV $', 'CPI', 'Status %',
    ]
    const lines: string[] = []
    if (reportTitle) lines.push([q('Report'), q(reportTitle)].join(','))
    lines.push([q('Generated'), q(new Date().toISOString())].join(','))
    lines.push([q('View'), q('By system')].join(','))
    lines.push(headers.join(','))
    for (const sys of data.systems) {
      for (const del of sys.deliverables) {
        for (const act of del.activities) {
          const e = act.evm
          lines.push([
            q(sys.systemName), q(sys.systemCode ?? ''), q(del.deliverableName), q(act.activityName),
            q(e.budgetHours.toFixed(2)), q(e.actualHours.toFixed(2)), q(e.etcHours.toFixed(2)),
            q(e.budgetCost.toFixed(2)), q(e.actualCost.toFixed(2)), q(e.etcCost.toFixed(2)),
            q(e.ev.toFixed(2)), q(e.cpi == null ? '' : e.cpi.toFixed(4)),
            q((e.statusPct * 100).toFixed(1)),
          ].join(','))
        }
        // Deliverable subtotal
        lines.push([
          q(sys.systemName), q(sys.systemCode ?? ''), q(`${del.deliverableName} (subtotal)`), q(''),
          q(del.rollup.budgetHours.toFixed(2)), q(del.rollup.actualHours.toFixed(2)), q(del.rollup.etcHours.toFixed(2)),
          q(del.rollup.budgetCost.toFixed(2)), q(del.rollup.actualCost.toFixed(2)), q(del.rollup.etcCost.toFixed(2)),
          q(del.rollup.ev.toFixed(2)), q(del.rollup.cpi == null ? '' : del.rollup.cpi.toFixed(4)),
          q((del.rollup.statusPct * 100).toFixed(1)),
        ].join(','))
      }
      // System subtotal
      lines.push([
        q(`${sys.systemName} (system total)`), q(sys.systemCode ?? ''), q(''), q(''),
        q(sys.rollup.budgetHours.toFixed(2)), q(sys.rollup.actualHours.toFixed(2)), q(sys.rollup.etcHours.toFixed(2)),
        q(sys.rollup.budgetCost.toFixed(2)), q(sys.rollup.actualCost.toFixed(2)), q(sys.rollup.etcCost.toFixed(2)),
        q(sys.rollup.ev.toFixed(2)), q(sys.rollup.cpi == null ? '' : sys.rollup.cpi.toFixed(4)),
        q((sys.rollup.statusPct * 100).toFixed(1)),
      ].join(','))
    }
    if (data.indirectTotal.budgetCost > 0 || data.indirectTotal.actualCost > 0) {
      const t = data.indirectTotal
      lines.push([
        q('Indirect (project-wide)'), q(''), q(''), q(''),
        q(t.budgetHours.toFixed(2)), q(t.actualHours.toFixed(2)), q(t.etcHours.toFixed(2)),
        q(t.budgetCost.toFixed(2)), q(t.actualCost.toFixed(2)), q(t.etcCost.toFixed(2)),
        q(t.ev.toFixed(2)), q(t.cpi == null ? '' : t.cpi.toFixed(4)),
        q((t.statusPct * 100).toFixed(1)),
      ].join(','))
    }
    const t = data.projectTotal
    lines.push([
      q('Project total'), q(''), q(''), q(''),
      q(t.budgetHours.toFixed(2)), q(t.actualHours.toFixed(2)), q(t.etcHours.toFixed(2)),
      q(t.budgetCost.toFixed(2)), q(t.actualCost.toFixed(2)), q(t.etcCost.toFixed(2)),
      q(t.ev.toFixed(2)), q(t.cpi == null ? '' : t.cpi.toFixed(4)),
      q((t.statusPct * 100).toFixed(1)),
    ].join(','))
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = (fileBaseName || `budget-by-system-${poId}`).replace(/[^A-Za-z0-9_-]+/g, '_')
    a.download = `${name}_by-system.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPdf = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const localStatusValue = (detailId: string, autoFraction: number, manualFraction: number | null) => {
    const local = localStatusByDetail[detailId]
    if (local !== undefined) return local
    if (manualFraction != null) return (manualFraction * 100).toFixed(1)
    return ''
  }

  const totalBudgetCost = data?.projectTotal.budgetCost ?? 0
  const totalActualCost = data?.projectTotal.actualCost ?? 0
  const totalEtcCost = data?.projectTotal.etcCost ?? 0
  const totalEv = data?.projectTotal.ev ?? 0
  const overallCpi = data?.projectTotal.cpi ?? null

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            By system <span className="text-sm font-normal text-gray-500 dark:text-gray-400">(Earned Value)</span>
          </h2>
          {reportTitle && <p className="text-xs text-gray-500 dark:text-gray-400">{reportTitle}</p>}
          {data && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Blended labor rate (fallback for cells without a bid line): ${data.blendedRate.toFixed(2)}/hr
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={printPdf}
            disabled={!data}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {data && data.systems.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          This PO has no system rows yet. Add matrix rows on the Project matrix tab to populate this view.
        </div>
      )}

      {/* Card grid */}
      {data && data.systems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.systems.map((sys) => (
            <SystemCard
              key={sys.systemId}
              sys={sys}
              onOpenDetails={() => setOpenSystemId(sys.systemId)}
            />
          ))}
        </div>
      )}

      {/* Indirect & project total */}
      {data && (
        <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {data.indirectTotal.budgetCost > 0 || data.indirectTotal.actualCost > 0 ? (
              <SummaryBlock
                label="Indirect (rolled into project total)"
                budget={data.indirectTotal.budgetCost}
                actual={data.indirectTotal.actualCost}
                etc={data.indirectTotal.etcCost}
                ev={data.indirectTotal.ev}
                statusPct={data.indirectTotal.statusPct}
                cpi={data.indirectTotal.cpi}
              />
            ) : (
              <div />
            )}
            <SummaryBlock
              label="Project total"
              budget={totalBudgetCost}
              actual={totalActualCost}
              etc={totalEtcCost}
              ev={totalEv}
              statusPct={data.projectTotal.statusPct}
              cpi={overallCpi}
              accent
            />
          </div>
        </div>
      )}

      {/* System Details modal */}
      {openSystem && data && (
        <SystemDetailsModal
          system={openSystem}
          canEdit={canEditMatrix}
          savingDetailId={savingDetailId}
          statusError={statusError}
          localValue={localStatusValue}
          onLocalChange={(detailId, v) =>
            setLocalStatusByDetail((prev) => ({ ...prev, [detailId]: v }))
          }
          onSaveStatus={saveStatusPct}
          onResetStatus={(detailId) => saveStatusPct(detailId, '')}
          onClose={() => setOpenSystemId(null)}
          onOpenCellDetail={openCellDetail}
        />
      )}

      {/* Per-cell Actual breakdown popup */}
      {cellDetailOpenForDetailId && (
        <CellDetailModal
          label={cellDetailLabel}
          loading={cellDetailLoading}
          error={cellDetailError}
          rows={cellDetailRows}
          totals={cellDetailTotals}
          onClose={closeCellDetail}
        />
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- */
/* Subcomponents                                                          */
/* --------------------------------------------------------------------- */

function SystemCard({ sys, onOpenDetails }: { sys: SystemNode; onOpenDetails: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug" title={sys.systemName}>
          {sys.systemName || '—'}
        </h3>
        {sys.systemCode && (
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 font-mono">{sys.systemCode}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Budget</div>
          <div className="font-medium tabular-nums">{fmtMoney(sys.rollup.budgetCost)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">ETC</div>
          <div className="font-medium tabular-nums">{fmtMoney(sys.rollup.etcCost)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Earned Value</div>
          <div className="font-medium tabular-nums">{fmtMoney(sys.rollup.ev)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Status</div>
          <div className="font-medium tabular-nums">{fmtPct(sys.rollup.statusPct)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          CPI {fmtCpi(sys.rollup.cpi)}
        </span>
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Details
        </button>
      </div>
    </div>
  )
}

function SummaryBlock({
  label, budget, actual, etc, ev, statusPct, cpi, accent,
}: {
  label: string
  budget: number
  actual: number
  etc: number
  ev: number
  statusPct: number
  cpi: number | null
  accent?: boolean
}) {
  return (
    <div
      className={`p-3 rounded-md ${
        accent
          ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <div>
          <div className="text-gray-500 dark:text-gray-400">Budget</div>
          <div className="font-medium tabular-nums">{fmtMoney(budget)}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">Actual</div>
          <div className="font-medium tabular-nums">{fmtMoney(actual)}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">ETC</div>
          <div className="font-medium tabular-nums">{fmtMoney(etc)}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">EV</div>
          <div className="font-medium tabular-nums">{fmtMoney(ev)}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">Status</div>
          <div className="font-medium tabular-nums">{fmtPct(statusPct)}</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">CPI</div>
          <div className="font-medium tabular-nums">{fmtCpi(cpi)}</div>
        </div>
      </div>
    </div>
  )
}

function SystemDetailsModal({
  system,
  canEdit,
  savingDetailId,
  statusError,
  localValue,
  onLocalChange,
  onSaveStatus,
  onResetStatus,
  onClose,
  onOpenCellDetail,
}: {
  system: SystemNode
  canEdit: boolean
  savingDetailId: string | null
  statusError: string | null
  localValue: (detailId: string, autoFraction: number, manualFraction: number | null) => string
  onLocalChange: (detailId: string, v: string) => void
  onSaveStatus: (detailId: string, raw: string) => void
  onResetStatus: (detailId: string) => void
  onClose: () => void
  onOpenCellDetail: (detailId: string, deliverableName: string, activityName: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-0 sm:p-4 flex items-stretch sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 w-full sm:max-w-3xl sm:rounded-xl shadow-xl flex flex-col max-h-screen sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 rounded-t-xl">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{system.systemName}</h3>
            {system.systemCode && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{system.systemCode}</p>
            )}
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <span><span className="text-gray-500 dark:text-gray-400">Budget</span> {fmtMoney(system.rollup.budgetCost)}</span>
              <span><span className="text-gray-500 dark:text-gray-400">Actual</span> {fmtMoney(system.rollup.actualCost)}</span>
              <span><span className="text-gray-500 dark:text-gray-400">ETC</span> {fmtMoney(system.rollup.etcCost)}</span>
              <span><span className="text-gray-500 dark:text-gray-400">EV</span> {fmtMoney(system.rollup.ev)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto px-3 sm:px-4 py-3 space-y-4">
          {statusError && (
            <p className="text-xs text-red-600 dark:text-red-400">{statusError}</p>
          )}
          {system.deliverables.map((del) => (
            <div key={del.deliverableId} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between gap-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{del.deliverableName}</h4>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                  Budget {fmtMoney(del.rollup.budgetCost)} · Actual {fmtMoney(del.rollup.actualCost)} · EV {fmtMoney(del.rollup.ev)}
                </span>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {del.activities.map((act) => {
                  const e = act.evm
                  const isSaving = savingDetailId === act.detailId
                  const local = localValue(act.detailId, e.autoStatusPct, act.manualStatusPct)
                  const localAsFraction = local === '' ? null : Math.max(0, Math.min(1, Number(local) / 100))
                  const isDirty = localAsFraction !== (act.manualStatusPct ?? null)
                  return (
                    <div key={act.detailId} className="p-3 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{act.activityName}</div>
                        {act.description && (
                          <span className="text-gray-500 dark:text-gray-400 truncate max-w-[40%]" title={act.description}>
                            {act.description}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-x-2 sm:gap-x-4">
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">Budget</div>
                          <div className="tabular-nums">{formatHours(e.budgetHours)} hrs</div>
                          <div className="tabular-nums text-gray-700 dark:text-gray-300">{fmtMoney(e.budgetCost)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">Actual</div>
                          <div className="tabular-nums">{formatHours(e.actualHours)} hrs</div>
                          <button
                            type="button"
                            onClick={() => onOpenCellDetail(act.detailId, del.deliverableName, act.activityName)}
                            disabled={e.actualCost <= 0}
                            className="tabular-nums text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-700 dark:disabled:text-gray-300 disabled:no-underline disabled:cursor-default text-left"
                            title={e.actualCost > 0 ? 'See per-week breakdown' : 'No actuals yet'}
                          >
                            {fmtMoney(e.actualCost)}
                          </button>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">ETC</div>
                          <div className="tabular-nums">{formatHours(e.etcHours)} hrs</div>
                          <div className="tabular-nums text-gray-700 dark:text-gray-300">{fmtMoney(e.etcCost)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                        <span><span className="text-gray-500 dark:text-gray-400">EV</span> <span className="tabular-nums">{fmtMoney(e.ev)}</span></span>
                        <span><span className="text-gray-500 dark:text-gray-400">CPI</span> <span className="tabular-nums">{fmtCpi(e.cpi)}</span></span>
                        <span className="flex items-center gap-1">
                          <span className="text-gray-500 dark:text-gray-400">Status %</span>
                          {canEdit ? (
                            <>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                inputMode="decimal"
                                placeholder={`auto: ${(e.autoStatusPct * 100).toFixed(1)}`}
                                value={local}
                                disabled={isSaving}
                                onChange={(ev) => onLocalChange(act.detailId, ev.target.value)}
                                onBlur={() => {
                                  if (!isDirty) return
                                  onSaveStatus(act.detailId, local)
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter') {
                                    ev.preventDefault()
                                    ;(ev.target as HTMLInputElement).blur()
                                  }
                                }}
                                className="w-20 h-7 px-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 tabular-nums"
                              />
                              {act.manualStatusPct != null && (
                                <button
                                  type="button"
                                  onClick={() => onResetStatus(act.detailId)}
                                  disabled={isSaving}
                                  className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                  title="Clear override and use auto-computed status"
                                >
                                  reset
                                </button>
                              )}
                              {act.manualStatusPct == null && (
                                <span className="text-gray-400 dark:text-gray-500">(auto)</span>
                              )}
                            </>
                          ) : (
                            <span className="tabular-nums">{fmtPct(e.statusPct)}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-gray-800 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function CellDetailModal({
  label,
  loading,
  error,
  rows,
  totals,
  onClose,
}: {
  label: string
  loading: boolean
  error: string | null
  rows: CellDetailRow[]
  totals: { hours: number; cost: number }
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 p-0 sm:p-4 flex items-stretch sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 w-full sm:max-w-2xl sm:rounded-xl shadow-xl flex flex-col max-h-screen sm:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">Actuals: {label}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto px-3 sm:px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No approved hours on this cell yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-gray-700 dark:text-gray-300">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-2 font-medium">Week ending</th>
                  <th className="text-left py-2 pr-2 font-medium">Employee</th>
                  <th className="text-right py-2 pr-2 font-medium">Hours</th>
                  <th className="text-right py-2 pr-2 font-medium">Cost</th>
                  <th className="text-right py-2 pl-2 font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.timesheetId} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-2 whitespace-nowrap text-gray-900 dark:text-gray-100">{r.weekEnding}</td>
                    <td className="py-2 pr-2 text-gray-900 dark:text-gray-100">{r.userName || '—'}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(r.cost)}</td>
                    <td className="py-2 pl-2 text-right">
                      <a
                        href={`/dashboard/timesheets/${r.timesheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Timesheet <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 dark:border-gray-600 font-medium text-gray-900 dark:text-gray-100">
                  <td className="py-2 pr-2" colSpan={2}>Totals</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{totals.hours.toFixed(2)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{fmtMoney(totals.cost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
