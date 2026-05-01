import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { billRateIsActiveOnDate, pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import {
  decodeIndirectNotes,
  indirectLineDollarTotal,
  effectiveIndirectTreatAs,
  indirectActivityName,
} from '@/lib/bid-sheet-indirect'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

type BillRateRow = {
  user_id: string
  rate: number
  effective_from_date?: string | null
  effective_to_date?: string | null
}

function sumEntryHours(e: Record<string, unknown>): number {
  const days = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const
  return days.reduce((s, k) => s + (Number(e[k]) || 0), 0)
}

const EPS = 1e-6

function nk(s: string | null | undefined): string {
  return (s ?? '').trim()
}

/** Match bid sheet matrix rows to project_details (same names after conversion). */
function matrixMatchKey(
  sysName: string,
  sysCode: string | null | undefined,
  delName: string,
  actName: string
): string {
  return [nk(sysName), nk(sysCode ?? ''), nk(delName), nk(actName)].join('|').toLowerCase()
}

type BidLineAgg = { hours: number; lineCost: number }

/**
 * When this PO came from a bid sheet conversion, each matrix cell had hours × bid_sheet_labor.bid_rate.
 * po_bill_rates may omit placeholders or differ from bid rates — use bid sheet as source of truth for Est. budget $.
 */
async function loadBidSheetLineCostMap(db: any, poId: string): Promise<Map<string, BidLineAgg>> {
  const { data: sheet } = await db.from('bid_sheets').select('id').eq('converted_po_id', poId).maybeSingle()
  const sheetRow = sheet as { id?: string } | null
  if (!sheetRow?.id) return new Map()

  const { data: items, error: itemsErr } = await db
    .from('bid_sheet_items')
    .select(
      `
      budgeted_hours,
      labor_id,
      bid_sheet_systems (name, code),
      bid_sheet_deliverables (name),
      bid_sheet_activities (name)
    `
    )
    .eq('bid_sheet_id', sheetRow.id)

  if (itemsErr || !items?.length) return new Map()

  const laborIds = [...new Set((items as { labor_id?: string | null }[]).map((i) => i.labor_id).filter(Boolean))] as string[]
  const { data: labRows } =
    laborIds.length > 0
      ? await db.from('bid_sheet_labor').select('id, bid_rate').in('id', laborIds)
      : { data: [] as { id: string; bid_rate?: number | null }[] }

  const rateByLabor = new Map<string, number>(
    (labRows || []).map((l: { id: string; bid_rate?: number | null }) => [l.id, Number(l.bid_rate) || 0])
  )

  const map = new Map<string, BidLineAgg>()
  for (const it of items as any[]) {
    const sys = it.bid_sheet_systems as { name?: string; code?: string | null } | null
    const del = it.bid_sheet_deliverables as { name?: string } | null
    const act = it.bid_sheet_activities as { name?: string } | null
    if (!sys?.name || !del?.name || !act?.name) continue
    const key = matrixMatchKey(sys.name, sys.code ?? null, del.name, act.name)
    const hrs = Number(it.budgeted_hours) || 0
    const rate = it.labor_id ? rateByLabor.get(it.labor_id as string) ?? 0 : 0
    const line = hrs * rate
    const cur = map.get(key) ?? { hours: 0, lineCost: 0 }
    cur.hours += hrs
    cur.lineCost += line
    map.set(key, cur)
  }

  // Also include activity-type indirect rows (PM / Doc Coord / Project Controls and
  // custom rows marked treatAs='activity') so their Est. budget $ uses bid-sheet
  // indirect dollars instead of falling back to blended labor rate.
  const { data: indirectRows } = await db
    .from('bid_sheet_indirect_labor')
    .select('category, notes, hours, rate')
    .eq('bid_sheet_id', sheetRow.id)

  for (const row of (indirectRows || []) as Array<{
    category: string
    notes?: string | null
    hours?: number | null
    rate?: number | null
  }>) {
    if (effectiveIndirectTreatAs(row.category, row.notes) !== 'activity') continue
    const activityName = indirectActivityName(row.category, row.notes)
    const hours = Number(row.hours) || 0
    const lineCost = indirectLineDollarTotal(hours, Number(row.rate) || 0, row.category, row.notes)
    if (hours <= EPS || lineCost <= EPS) continue
    const key = matrixMatchKey('Indirect', null, 'Indirect', activityName)
    const cur = map.get(key) ?? { hours: 0, lineCost: 0 }
    cur.hours += hours
    cur.lineCost += lineCost
    map.set(key, cur)
  }

  return map
}

const PRESET_INDIRECT_LABEL: Record<string, string> = {
  project_management: 'Indirect — Project Management',
  document_coordinator: 'Indirect — Document Coordinator',
  project_controls: 'Indirect — Project Controls',
  travel_living_project: 'Indirect — Travel & Living (Project by Person)',
  travel_living_fat: 'Indirect — Travel & Living (FAT)',
  additional_indirect: 'Indirect — Additional Indirect Costs',
}

function bidIndirectRowLabel(category: string, notes: string | null | undefined): string {
  if (category.startsWith('custom_')) {
    const meta = decodeIndirectNotes(notes)
    const name = meta.label?.trim()
    return name ? `Indirect — ${name}` : 'Indirect — Additional line'
  }
  return PRESET_INDIRECT_LABEL[category] || `Indirect — ${category}`
}

export type IndirectLine = {
  id: string
  label: string
  budgetCost: number
  actualCost: number
  /** 'bidsheet_fallback' when synthesized from bid_sheet_indirect_labor (no real po_expense yet). */
  source?: 'po_expense' | 'bidsheet_fallback'
  /** The bid_sheet_indirect_labor row ID — present on fallback rows for repair operations. */
  bidSheetRowId?: string
}

export type MissingActivity = {
  bidSheetRowId: string
  category: string
  notes: string | null
  activityName: string
  hours: number
}

/**
 * If po_expenses is empty or all zeros (RLS, or conversion gap), derive the same indirect $ as the bid sheet
 * from bid_sheet_indirect_labor for the sheet that converted to this PO.
 * Only returns *expense-type* rows — activity-type rows (PM, DocCoord, ProjControls) belong
 * in the regular matrix via project_details and are excluded here.
 */
async function loadIndirectLinesFromBidSheetFallback(db: any, poId: string): Promise<IndirectLine[]> {
  const { data: sheet } = await db.from('bid_sheets').select('id').eq('converted_po_id', poId).maybeSingle()
  const sid = (sheet as { id?: string } | null)?.id
  if (!sid) return []

  const { data: indirectRows } = await db.from('bid_sheet_indirect_labor').select('*').eq('bid_sheet_id', sid)
  const out: IndirectLine[] = []
  for (const row of indirectRows || []) {
    const r = row as {
      id: string
      category: string
      notes?: string | null
      hours?: number | null
      rate?: number | null
    }
    // Activity-type rows (PM, DocCoord, ProjControls) should live in project_details
    // and show up in the regular matrix — skip them here.
    if (effectiveIndirectTreatAs(r.category, r.notes) === 'activity') continue

    const amt = indirectLineDollarTotal(Number(r.hours) || 0, Number(r.rate) || 0, r.category, r.notes)
    if (amt <= EPS) continue
    // Bid sheet indirect rows are *projections* — nothing has been expended yet.
    out.push({
      id: `bid-sheet-indirect:${r.id}`,
      label: bidIndirectRowLabel(r.category, r.notes),
      budgetCost: amt,
      actualCost: 0,
      source: 'bidsheet_fallback',
      bidSheetRowId: r.id,
    })
  }
  return out
}

/**
 * Find activity-type bid sheet indirect rows (PM, DocCoord, etc.) that should have been
 * converted to project_details rows but are missing — e.g. because the bid sheet was
 * converted before the activity-type logic was added. Returns rows the caller can use to
 * offer a one-click repair (POST /api/budget/[poId]/sync-indirect-activities).
 */
async function detectMissingIndirectActivities(
  db: any,
  poId: string,
  existingActivityNames: Set<string>
): Promise<MissingActivity[]> {
  const { data: sheet } = await db.from('bid_sheets').select('id').eq('converted_po_id', poId).maybeSingle()
  const sid = (sheet as { id?: string } | null)?.id
  if (!sid) return []

  const { data: indirectRows } = await db
    .from('bid_sheet_indirect_labor')
    .select('id, category, notes, hours, rate')
    .eq('bid_sheet_id', sid)

  const out: MissingActivity[] = []
  for (const row of indirectRows || []) {
    const r = row as { id: string; category: string; notes?: string | null; hours?: number | null; rate?: number | null }
    if (effectiveIndirectTreatAs(r.category, r.notes) !== 'activity') continue
    // Skip activity-type rows the bid sheet left blank (0 hours). Those are
    // categories the proposal didn't actually budget for — surfacing them as
    // "missing" would prompt the user to add empty rows that aren't part of
    // this project's scope. Users can still add them manually from the matrix
    // later if scope changes.
    const hours = Number(r.hours) || 0
    if (hours <= 0) continue
    const actName = indirectActivityName(r.category, r.notes)
    if (existingActivityNames.has(actName.toLowerCase())) continue
    out.push({
      bidSheetRowId: r.id,
      category: r.category,
      notes: r.notes ?? null,
      activityName: actName,
      hours,
    })
  }
  return out
}

/** Average of each person’s current PO bill rate (active as of `asOf`), one rate per user. */
function blendedBudgetRate(rows: BillRateRow[], asOf: string): number {
  const byUser = new Map<string, BillRateRow[]>()
  for (const r of rows) {
    if (!r.user_id) continue
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id)!.push(r)
  }
  let sum = 0
  let n = 0
  for (const [, userRows] of byUser) {
    const applicable = userRows.filter((br) => billRateIsActiveOnDate(br, asOf))
    if (applicable.length === 0) continue
    const best = [...applicable].sort((a, b) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )[0]
    sum += Number(best.rate) || 0
    n++
  }
  return n > 0 ? sum / n : 0
}

export async function GET(_req: Request, { params }: { params: Promise<{ poId: string }> }) {
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

  const { data: po } = await supabase.from('purchase_orders').select('id, budget_type, site_id').eq('id', poId).single()
  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }
  if (po.budget_type !== 'project') {
    return NextResponse.json({ error: 'Not a project budget' }, { status: 400 })
  }

  let db = supabase
  try {
    db = createAdminClient()
  } catch {
    /* fall back to user client */
  }

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
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)

  if (detErr) {
    return NextResponse.json({ error: detErr.message }, { status: 500 })
  }

  const { data: rawEntries } = await db
    .from('timesheet_entries')
    .select(
      'timesheet_id, system_id, deliverable_id, activity_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
    )
    .eq('po_id', poId)

  const entriesList = rawEntries || []
  const tsIdsFromEntries = [...new Set(entriesList.map((e) => e.timesheet_id as string).filter(Boolean))]

  const tsMap = new Map<string, { id: string; user_id: string; week_ending: string }>()
  if (tsIdsFromEntries.length > 0) {
    const { data: tsRows } = await db
      .from('weekly_timesheets')
      .select('id, user_id, week_ending')
      .in('id', tsIdsFromEntries)
      .eq('status', 'approved')
    for (const t of tsRows || []) {
      tsMap.set(t.id, t as { id: string; user_id: string; week_ending: string })
    }
  }

  const entries = entriesList.filter((e) => tsMap.has(e.timesheet_id as string))

  const actualMap = new Map<string, number>()
  const actualCostMap = new Map<string, number>()
  let totalAllEntries = 0
  for (const e of entries) {
    const h = sumEntryHours(e)
    totalAllEntries += h
    const sid = e.system_id as string | null | undefined
    const did = e.deliverable_id as string | null | undefined
    const aid = e.activity_id as string | null | undefined
    if (!sid || !did || !aid) continue
    const key = `${sid}|${did}|${aid}`
    actualMap.set(key, (actualMap.get(key) || 0) + h)

    const ts = tsMap.get(e.timesheet_id as string)
    if (ts && h > 0) {
      const we = String(ts.week_ending || '').slice(0, 10)
      const userRates = ratesByUser.get(ts.user_id) || []
      const rate = pickEffectiveRateForWeek(userRates, we)
      const cost = h * rate
      actualCostMap.set(key, (actualCostMap.get(key) || 0) + cost)
    }
  }

  const rows = (detailRows || []).map((r: Record<string, unknown>) => {
    const sys = r.systems as { name?: string; code?: string | null } | null
    const del = r.deliverables as { name?: string } | null
    const act = r.activities as { name?: string } | null
    const systemId = r.system_id as string
    const deliverableId = r.deliverable_id as string
    const activityId = r.activity_id as string
    const key = `${systemId}|${deliverableId}|${activityId}`
    const actual = actualMap.get(key) || 0
    const budgeted = Number(r.budgeted_hours) || 0
    const name = sys?.name || ''
    const code = sys?.code
    const systemLabel = code
      ? `${name}${name ? ' ' : ''}(${code})`.trim()
      : name || '—'
    const matchKey = matrixMatchKey(name, code ?? null, del?.name || '', act?.name || '')
    const bidInfo = bidSheetLineCosts.get(matchKey)
    const budgetCost =
      bidInfo && bidInfo.hours > EPS
        ? budgeted * (bidInfo.lineCost / bidInfo.hours)
        : budgeted * blendedRate
    const actualCost = actualCostMap.get(key) || 0
    return {
      id: r.id as string,
      systemLabel: systemLabel || '—',
      deliverableName: del?.name || '—',
      activityName: act?.name || '—',
      description: (r.description as string | null | undefined) ?? null,
      budgetedHours: budgeted,
      actualHours: actual,
      variance: budgeted - actual,
      budgetCost,
      actualCost,
      costVariance: budgetCost - actualCost,
    }
  })

  rows.sort((a, b) => {
    const aLabel = `${a.systemLabel}|${a.deliverableName}|${a.activityName}`
    const bLabel = `${b.systemLabel}|${b.deliverableName}|${b.activityName}`
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' })
  })

  const totalBudgeted = rows.reduce((s, r) => s + r.budgetedHours, 0)
  const totalActualMatrix = rows.reduce((s, r) => s + r.actualHours, 0)
  const unmatchedActualHours = Math.max(0, totalAllEntries - totalActualMatrix)
  const totalBudgetCost = rows.reduce((s, r) => s + r.budgetCost, 0)
  const totalActualCost = rows.reduce((s, r) => s + r.actualCost, 0)

  const { data: expenseRows } = await db.from('po_expenses').select('id, amount, custom_type_name').eq('po_id', poId)

  // po_expenses entries are *actual* incurred costs the user logged during
  // the project. Surface them with actualCost = amount and budgetCost = 0.
  let indirectLines: IndirectLine[] = (expenseRows || []).map((e: Record<string, unknown>) => {
    const amt = Number(e.amount) || 0
    const label = String(e.custom_type_name || 'Expense').trim() || 'Expense'
    return {
      id: e.id as string,
      label,
      budgetCost: 0,
      actualCost: amt,
      source: 'po_expense' as const,
    }
  })
  // Fallback: when no real po_expenses exist yet, synthesize expense-type indirect
  // lines from the bid sheet's projected indirect costs (projections only, actual = 0).
  // Activity-type rows (PM, DocCoord, etc.) are excluded from the fallback — they
  // belong in project_details and appear in the regular matrix.
  const poActualSum = indirectLines.reduce((s, x) => s + x.actualCost, 0)
  if (poActualSum <= EPS) {
    indirectLines = await loadIndirectLinesFromBidSheetFallback(db, poId)
  }
  const indirectBudgetTotal = indirectLines.reduce((s, x) => s + x.budgetCost, 0)
  const indirectActualTotal = indirectLines.reduce((s, x) => s + x.actualCost, 0)

  // Detect activity-type indirect rows from the bid sheet that are missing
  // from project_details (can happen for budgets converted before this logic existed).
  const existingActivityNames = new Set(
    (detailRows || [])
      .map((d) => ((d as { activities?: { name?: string } }).activities?.name ?? '').toLowerCase())
      .filter(Boolean)
  )
  const missingActivities = await detectMissingIndirectActivities(db, poId, existingActivityNames)

  const grandBudgetCost = totalBudgetCost + indirectBudgetTotal
  const grandActualCost = totalActualCost + indirectActualTotal

  let budgetCostLabel =
    bidSheetLineCosts.size > 0
      ? 'Est. budget $ uses the same effective labor rate as the source bid sheet (hours × bid rate per cell), scaled to current budgeted hours per line. Rows without a bid-sheet match use budgeted hours × the average of each team member’s bill rate on this PO. Actual $ sums approved timesheet hours × that person’s effective rate for each week.'
      : 'Est. budget $ uses budgeted hours × the average of each team member’s current bill rate on this PO. Actual $ sums approved timesheet hours × that person’s effective rate for each week.'
  if (indirectBudgetTotal > EPS) {
    budgetCostLabel +=
      ' Indirect / expense lines from this PO (e.g. imported from the bid sheet) appear below the labor matrix and are included in the grand total.'
  }

  return NextResponse.json(
    {
      siteId: po.site_id ?? null,
      costModel: {
        blendedBudgetRate: blendedRate,
        budgetCostLabel,
      },
      rows,
      indirectLines,
      missingActivities,
      totals: {
        budgetedHours: totalBudgeted,
        actualHoursInMatrix: totalActualMatrix,
        actualHoursAllEntries: totalAllEntries,
        unmatchedActualHours,
        matrixBudgetCost: totalBudgetCost,
        matrixActualCost: totalActualCost,
        indirectBudgetCost: indirectBudgetTotal,
        indirectActualCost: indirectActualTotal,
        budgetCost: grandBudgetCost,
        actualCost: grandActualCost,
        costVariance: grandBudgetCost - grandActualCost,
      },
    },
    noStore
  )
}
