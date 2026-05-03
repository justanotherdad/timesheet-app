import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { billRateIsActiveOnDate, pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import { type BillRateRow, sumEntryHours } from '@/lib/budget-cost-utils'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

type IndividualRow = {
  /** user_id when this row represents a real user; null for the synthetic
   *  "Unassigned" row (bid-sheet placeholders without a linked user). */
  userId: string | null
  name: string
  title: string | null
  /** Most recent active po_bill_rate. Null when the user has none on this PO. */
  rate: number | null
  budgetHours: number
  budgetCost: number
  expendedHours: number
  expendedCost: number
}

/**
 * GET /api/budget/[poId]/by-individual
 *
 * Returns one row per person who appears on this PO — either as a budgeted
 * resource on the source bid sheet or as an actual logger of approved
 * timesheet hours. Unassigned bid-sheet placeholders are folded into a
 * single "Unassigned" row so the totals always balance.
 *
 * Footer fields:
 *   • averageRate — simple mean of each row's `rate` (skipping nulls)
 *   • totals { budgetHours, budgetCost, expendedHours, expendedCost }
 *   • budgetRemaining — original_po_amount − totalExpendedCost − Σ(po_expenses)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, budget_type, original_po_amount, po_balance')
    .eq('id', poId)
    .single()
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.budget_type !== 'project') {
    return NextResponse.json({ error: 'Not a project budget' }, { status: 400 })
  }

  let db = supabase
  try { db = createAdminClient() } catch { /* fall back to user client */ }

  // ----- Bid-sheet allocations: who was budgeted to do what hours -----
  const { data: sheet } = await db.from('bid_sheets').select('id').eq('converted_po_id', poId).maybeSingle()
  const bidSheetId: string | null = (sheet as { id?: string } | null)?.id ?? null

  const budgetByUser = new Map<string, { hours: number; cost: number }>()
  // Synthetic key for unassigned bid-sheet placeholders so rows still sum.
  const UNASSIGNED_KEY = '__unassigned__'

  if (bidSheetId) {
    const { data: items } = await db
      .from('bid_sheet_items')
      .select('budgeted_hours, labor_id')
      .eq('bid_sheet_id', bidSheetId)

    const laborIds = [
      ...new Set(
        ((items || []) as Array<{ labor_id?: string | null }>).map((i) => i.labor_id).filter(Boolean)
      ),
    ] as string[]

    type LaborRow = { id: string; user_id: string | null; placeholder_name: string | null; bid_rate: number | null }
    const laborById = new Map<string, LaborRow>()
    if (laborIds.length > 0) {
      const { data: labRows } = await db
        .from('bid_sheet_labor')
        .select('id, user_id, placeholder_name, bid_rate')
        .in('id', laborIds)
      for (const l of (labRows || []) as LaborRow[]) {
        laborById.set(l.id, l)
      }
    }

    for (const it of (items || []) as Array<{ budgeted_hours?: number | null; labor_id?: string | null }>) {
      const hours = Number(it.budgeted_hours) || 0
      if (hours <= 0) continue
      const laborId = it.labor_id || null
      if (!laborId) {
        const cur = budgetByUser.get(UNASSIGNED_KEY) ?? { hours: 0, cost: 0 }
        cur.hours += hours
        budgetByUser.set(UNASSIGNED_KEY, cur)
        continue
      }
      const lab = laborById.get(laborId)
      if (!lab) continue
      const rate = Number(lab.bid_rate) || 0
      const cost = hours * rate
      // Use user_id when assigned; otherwise key by labor row id so multiple
      // distinct placeholders stay separate (we'll show them as their
      // placeholder_name).
      const key = lab.user_id ? lab.user_id : `placeholder:${lab.id}`
      const cur = budgetByUser.get(key) ?? { hours: 0, cost: 0 }
      cur.hours += hours
      cur.cost += cost
      budgetByUser.set(key, cur)
    }

    // Stash placeholder display names so we can show them in rows below.
    void laborById // keep referenced
  }

  // ----- Bill rates: per-user effective rate + headline "Rate" column -----
  const { data: billRateRows } = await db
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)

  const today = new Date().toISOString().slice(0, 10)
  const ratesByUser = new Map<string, BillRateRow[]>()
  for (const br of (billRateRows || []) as BillRateRow[]) {
    if (!br.user_id) continue
    if (!ratesByUser.has(br.user_id)) ratesByUser.set(br.user_id, [])
    ratesByUser.get(br.user_id)!.push(br)
  }

  const headlineRateByUser = new Map<string, number>()
  for (const [uid, rows] of ratesByUser) {
    // Most-recently-effective active rate as of today; fall back to the most
    // recent rate the user ever had on this PO.
    const active = rows.filter((br) => billRateIsActiveOnDate(br, today))
    const pool = active.length > 0 ? active : rows
    const best = [...pool].sort((a, b) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )[0]
    if (best) headlineRateByUser.set(uid, Number(best.rate) || 0)
  }

  // ----- Expended (approved) labor hours/cost per user -----
  const { data: rawEntries } = await db
    .from('timesheet_entries')
    .select(
      'timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
    )
    .eq('po_id', poId)

  const entriesList = (rawEntries || []) as Array<Record<string, unknown>>
  const tsIds = [...new Set(entriesList.map((e) => e.timesheet_id as string).filter(Boolean))]

  const tsMap = new Map<string, { user_id: string; week_ending: string }>()
  if (tsIds.length > 0) {
    const { data: tsRows } = await db
      .from('weekly_timesheets')
      .select('id, user_id, week_ending')
      .in('id', tsIds)
      .eq('status', 'approved')
    for (const t of (tsRows || []) as Array<{ id: string; user_id: string; week_ending: string }>) {
      tsMap.set(t.id, { user_id: t.user_id, week_ending: t.week_ending })
    }
  }

  const expendedByUser = new Map<string, { hours: number; cost: number }>()
  for (const e of entriesList) {
    const tsId = e.timesheet_id as string | null | undefined
    if (!tsId) continue
    const ts = tsMap.get(tsId)
    if (!ts) continue
    const hours = sumEntryHours(e)
    if (hours <= 0) continue
    const we = String(ts.week_ending || '').slice(0, 10)
    const userRates = ratesByUser.get(ts.user_id) || []
    const rate = pickEffectiveRateForWeek(userRates, we)
    const cur = expendedByUser.get(ts.user_id) ?? { hours: 0, cost: 0 }
    cur.hours += hours
    cur.cost += hours * rate
    expendedByUser.set(ts.user_id, cur)
  }

  // ----- Resolve display names + titles for every user we'll show -----
  // We need names/titles for: budgeted users (real user_ids), expended users.
  const realUserIds = new Set<string>()
  for (const k of budgetByUser.keys()) {
    if (k !== UNASSIGNED_KEY && !k.startsWith('placeholder:')) realUserIds.add(k)
  }
  for (const k of expendedByUser.keys()) realUserIds.add(k)

  type ProfileRow = { id: string; name: string | null; title: string | null }
  const profileById = new Map<string, ProfileRow>()
  if (realUserIds.size > 0) {
    const { data: profiles } = await db
      .from('user_profiles')
      .select('id, name, title')
      .in('id', [...realUserIds])
    for (const p of (profiles || []) as ProfileRow[]) {
      profileById.set(p.id, p)
    }
  }

  // Placeholder display names: pull labor rows referenced by placeholder keys.
  const placeholderLaborIds: string[] = []
  for (const k of budgetByUser.keys()) {
    if (k.startsWith('placeholder:')) placeholderLaborIds.push(k.slice('placeholder:'.length))
  }
  type PlaceholderRow = { id: string; placeholder_name: string | null }
  const placeholderById = new Map<string, PlaceholderRow>()
  if (placeholderLaborIds.length > 0) {
    const { data: rows } = await db
      .from('bid_sheet_labor')
      .select('id, placeholder_name')
      .in('id', placeholderLaborIds)
    for (const r of (rows || []) as PlaceholderRow[]) {
      placeholderById.set(r.id, r)
    }
  }

  // ----- Stitch into output rows -----
  const allKeys = new Set<string>([...budgetByUser.keys(), ...expendedByUser.keys()])
  const rows: IndividualRow[] = []
  for (const key of allKeys) {
    const budget = budgetByUser.get(key) ?? { hours: 0, cost: 0 }
    const expended = expendedByUser.get(key) ?? { hours: 0, cost: 0 }

    let userId: string | null = null
    let name = ''
    let title: string | null = null
    let rate: number | null = null

    if (key === UNASSIGNED_KEY) {
      name = 'Unassigned'
    } else if (key.startsWith('placeholder:')) {
      const ph = placeholderById.get(key.slice('placeholder:'.length))
      name = ph?.placeholder_name || 'Placeholder'
      // Placeholders don't have a user_profiles row; rate isn't meaningful.
    } else {
      userId = key
      const profile = profileById.get(key)
      name = profile?.name || '(Unknown user)'
      title = profile?.title ?? null
      const r = headlineRateByUser.get(key)
      rate = r === undefined ? null : r
    }

    rows.push({
      userId,
      name,
      title,
      rate,
      budgetHours: budget.hours,
      budgetCost: budget.cost,
      expendedHours: expended.hours,
      expendedCost: expended.cost,
    })
  }

  rows.sort((a, b) => {
    // "Unassigned" / placeholder rows sink to the bottom so real people lead.
    const aRank = a.userId ? 0 : 1
    const bRank = b.userId ? 0 : 1
    if (aRank !== bRank) return aRank - bRank
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  // ----- Footer totals -----
  const totals = rows.reduce(
    (acc, r) => {
      acc.budgetHours += r.budgetHours
      acc.budgetCost += r.budgetCost
      acc.expendedHours += r.expendedHours
      acc.expendedCost += r.expendedCost
      return acc
    },
    { budgetHours: 0, budgetCost: 0, expendedHours: 0, expendedCost: 0 }
  )

  // Average rate = simple mean of headline rates (per user choice). Skip
  // rows without a rate (placeholders, users with no po_bill_rate).
  const ratedRows = rows.filter((r) => typeof r.rate === 'number' && Number.isFinite(r.rate))
  const averageRate =
    ratedRows.length > 0
      ? ratedRows.reduce((s, r) => s + (r.rate as number), 0) / ratedRows.length
      : 0

  // Budget remaining = original_po_amount − total expended labor cost − Σ
  // expenses on this PO. This tells the user how much $ they have left
  // overall (labor + expenses) on this PO.
  const { data: expensesRows } = await db.from('po_expenses').select('amount').eq('po_id', poId)
  const expensesTotal = ((expensesRows || []) as Array<{ amount?: number | null }>).reduce(
    (s, e) => s + (Number(e.amount) || 0),
    0
  )
  const original = Number(po.original_po_amount) || 0
  const budgetRemaining = original - totals.expendedCost - expensesTotal

  return NextResponse.json(
    {
      rows,
      totals,
      averageRate,
      budgetRemaining,
      originalPoAmount: original,
      expensesTotal,
    },
    noStore
  )
}
