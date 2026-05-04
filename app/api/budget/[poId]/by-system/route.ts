import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import {
  type BillRateRow,
  blendedBudgetRate,
  effectiveLineRate,
  loadBidSheetLineCostMap,
  matrixMatchKey,
  sumEntryHours,
} from '@/lib/budget-cost-utils'
import { computeCellEvm, type EvmCellResult, rollupEvm } from '@/lib/evm'
import { INDIRECT_SYSTEM_NAME } from '@/lib/bid-sheet-indirect'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

type ActivityNode = {
  detailId: string
  activityId: string
  activityName: string
  description: string | null
  manualStatusPct: number | null
  evm: EvmCellResult
  /** True for cells that belong to the synthetic "Indirect" system. */
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

/**
 * GET /api/budget/[poId]/by-system
 *
 * Hierarchical EVM payload for the "By system" tab. Returns one node per
 * real system on the PO (the synthetic "Indirect" system is split into
 * indirectTotal so it doesn't get a card but still rolls up into the
 * project total). Each system → deliverable → activity carries the full
 * EVM result (Budget / Actual / ETC / EV / CPI / Status %), plus the
 * matrix cell id and the manual status_pct override (when set) so the UI
 * can edit the override and PATCH it back via /project-details.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, budget_type')
    .eq('id', poId)
    .single()
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.budget_type !== 'project') {
    return NextResponse.json({ error: 'Not a project budget' }, { status: 400 })
  }

  let db = supabase
  try { db = createAdminClient() } catch { /* fall back to user client */ }

  // Bid-sheet line costs + bill rates, used to pin Est. budget $ to the bid
  // sheet wherever possible (same source of truth as the matrix).
  const bidSheetLineCosts = await loadBidSheetLineCostMap(db, poId)

  const { data: billRateRows } = await db
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)

  const today = new Date().toISOString().slice(0, 10)
  const blendedRate = blendedBudgetRate((billRateRows || []) as BillRateRow[], today)

  const ratesByUser = new Map<string, BillRateRow[]>()
  for (const br of billRateRows || []) {
    const row = br as BillRateRow
    if (!row.user_id) continue
    if (!ratesByUser.has(row.user_id)) ratesByUser.set(row.user_id, [])
    ratesByUser.get(row.user_id)!.push(row)
  }

  const { data: detailRows, error: detErr } = await db
    .from('project_details')
    .select(
      `
      id,
      budgeted_hours,
      description,
      status_pct,
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)
  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 500 })

  // Approved entries on this PO drive Actual hours/cost. Pull entries first,
  // then narrow to those whose timesheet is approved (same logic the matrix
  // uses).
  const { data: rawEntries } = await db
    .from('timesheet_entries')
    .select(
      'timesheet_id, system_id, deliverable_id, activity_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
    )
    .eq('po_id', poId)

  const entriesList = (rawEntries || []) as Array<Record<string, unknown>>
  const tsIds = [
    ...new Set(entriesList.map((e) => e.timesheet_id as string).filter(Boolean)),
  ]
  const tsMap = new Map<string, { user_id: string; week_ending: string }>()
  if (tsIds.length > 0) {
    const { data: tsRows } = await db
      .from('weekly_timesheets')
      .select('id, user_id, week_ending')
      .in('id', tsIds)
      .eq('status', 'approved')
    for (const t of tsRows || []) {
      tsMap.set(
        (t as { id: string }).id,
        { user_id: (t as { user_id: string }).user_id, week_ending: (t as { week_ending: string }).week_ending }
      )
    }
  }

  const actualHoursByCell = new Map<string, number>()
  const actualCostByCell = new Map<string, number>()
  for (const e of entriesList) {
    const tsId = e.timesheet_id as string | null | undefined
    if (!tsId) continue
    const ts = tsMap.get(tsId)
    if (!ts) continue
    const sid = e.system_id as string | null | undefined
    const did = e.deliverable_id as string | null | undefined
    const aid = e.activity_id as string | null | undefined
    if (!sid || !did || !aid) continue

    const hours = sumEntryHours(e)
    if (hours <= 0) continue
    const we = String(ts.week_ending || '').slice(0, 10)
    const userRates = ratesByUser.get(ts.user_id) || []
    const rate = pickEffectiveRateForWeek(userRates, we)
    const key = `${sid}|${did}|${aid}`
    actualHoursByCell.set(key, (actualHoursByCell.get(key) || 0) + hours)
    actualCostByCell.set(key, (actualCostByCell.get(key) || 0) + hours * rate)
  }

  // Build the System → Deliverable → Activity tree
  const systemMap = new Map<string, SystemNode>()
  for (const r of (detailRows || []) as Array<Record<string, unknown>>) {
    const sys = r.systems as { id?: string; name?: string; code?: string | null } | null
    const del = r.deliverables as { id?: string; name?: string } | null
    const act = r.activities as { id?: string; name?: string } | null
    const sysId = (r.system_id as string) || sys?.id || ''
    const delId = (r.deliverable_id as string) || del?.id || ''
    const actId = (r.activity_id as string) || act?.id || ''
    if (!sysId || !delId || !actId) continue

    const sysName = sys?.name || ''
    const sysCode = sys?.code ?? null
    const delName = del?.name || ''
    const actName = act?.name || ''

    const cellKey = `${sysId}|${delId}|${actId}`
    const matchKey = matrixMatchKey(sysName, sysCode, delName, actName)
    const bidLine = bidSheetLineCosts.get(matchKey)
    const lineRate = effectiveLineRate(bidLine, blendedRate)

    const budgetHours = Number(r.budgeted_hours) || 0
    // Prefer the bid-line dollar amount when available (so the budget matches
    // exactly what was budgeted on the proposal, even if the rate fell off
    // slightly due to integer rounding in stored cents). Otherwise compute it.
    const budgetCost =
      bidLine && bidLine.hours > 0
        ? budgetHours * (bidLine.lineCost / bidLine.hours)
        : budgetHours * lineRate

    const evm = computeCellEvm({
      budgetHours,
      budgetCost,
      actualHours: actualHoursByCell.get(cellKey) || 0,
      actualCost: actualCostByCell.get(cellKey) || 0,
      rate: lineRate,
      manualStatusPct: r.status_pct == null ? null : Number(r.status_pct),
    })

    const isIndirect = (sysName || '').toLowerCase() === INDIRECT_SYSTEM_NAME.toLowerCase()

    let sysNode = systemMap.get(sysId)
    if (!sysNode) {
      sysNode = {
        systemId: sysId,
        systemName: sysName || '—',
        systemCode: sysCode,
        rollup: emptyRollup(),
        deliverables: [],
      }
      systemMap.set(sysId, sysNode)
    }
    let delNode = sysNode.deliverables.find((d) => d.deliverableId === delId)
    if (!delNode) {
      delNode = {
        deliverableId: delId,
        deliverableName: delName || '—',
        rollup: emptyRollup(),
        activities: [],
      }
      sysNode.deliverables.push(delNode)
    }
    delNode.activities.push({
      detailId: r.id as string,
      activityId: actId,
      activityName: actName || '—',
      description: (r.description as string | null) ?? null,
      manualStatusPct: r.status_pct == null ? null : Number(r.status_pct),
      evm,
      isIndirect,
    })
  }

  // Compute rollups (system & deliverable) and totals. The synthetic
  // "Indirect" system stays as a SystemNode (so the UI can drill into its
  // deliverables → activities and reuse the same details modal as real
  // systems) but is returned separately so it doesn't get rendered as just
  // another card in the system grid.
  const realSystems: SystemNode[] = []
  let indirectSystem: SystemNode | null = null
  const allCells: EvmCellResult[] = []

  for (const sysNode of systemMap.values()) {
    const sysCells: EvmCellResult[] = []
    for (const del of sysNode.deliverables) {
      const delCells = del.activities.map((a) => a.evm)
      del.rollup = rollupEvm(delCells)
      sysCells.push(...delCells)
      del.activities.sort((a, b) =>
        a.activityName.localeCompare(b.activityName, undefined, { sensitivity: 'base' })
      )
    }
    sysNode.rollup = rollupEvm(sysCells)
    sysNode.deliverables.sort((a, b) =>
      a.deliverableName.localeCompare(b.deliverableName, undefined, { sensitivity: 'base' })
    )

    const isIndirectSystem =
      sysNode.systemName.toLowerCase() === INDIRECT_SYSTEM_NAME.toLowerCase()
    if (isIndirectSystem) {
      indirectSystem = sysNode
    } else {
      realSystems.push(sysNode)
    }
    allCells.push(...sysCells)
  }

  realSystems.sort((a, b) =>
    a.systemName.localeCompare(b.systemName, undefined, { sensitivity: 'base', numeric: true })
  )

  // Backward-compatible total used by the summary numbers. Equivalent to
  // indirectSystem?.rollup when present.
  const indirectTotal = indirectSystem?.rollup ?? emptyRollup()
  const projectTotal = rollupEvm(allCells)

  return NextResponse.json(
    {
      blendedRate,
      systems: realSystems,
      indirectSystem,
      indirectTotal,
      projectTotal,
    },
    noStore
  )
}

function emptyRollup(): EvmCellResult {
  return {
    budgetHours: 0,
    budgetCost: 0,
    actualHours: 0,
    actualCost: 0,
    statusPct: 0,
    isManualStatus: false,
    autoStatusPct: 0,
    etcHours: 0,
    etcCost: 0,
    ev: 0,
    cpi: null,
  }
}
