import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import { type BillRateRow, sumEntryHours } from '@/lib/budget-cost-utils'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

type CellDetailRow = {
  timesheetId: string
  weekEnding: string
  userId: string
  userName: string
  hours: number
  cost: number
}

/**
 * GET /api/budget/[poId]/cell-detail?detailId=<project_details.id>
 *
 * Per-week breakdown of approved-timesheet hours and cost on a single
 * matrix cell (system × deliverable × activity). Used by the "Actual" cost
 * popup in the By system tab — clicking the dollar amount on an activity
 * row reveals which (week_ending, employee) combinations make it up, and
 * each row links to its source timesheet.
 *
 * Validates the detail id belongs to this PO before disclosing entries.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const url = new URL(req.url)
  const detailId = url.searchParams.get('detailId')
  if (!detailId) return NextResponse.json({ error: 'detailId is required' }, { status: 400 })

  let db = supabase
  try { db = createAdminClient() } catch { /* fall back to user client */ }

  const { data: detail } = await db
    .from('project_details')
    .select('po_id, system_id, deliverable_id, activity_id')
    .eq('id', detailId)
    .maybeSingle()
  const d = detail as { po_id?: string; system_id?: string; deliverable_id?: string; activity_id?: string } | null
  if (!d || d.po_id !== poId) {
    return NextResponse.json({ error: 'Matrix cell not found on this PO' }, { status: 404 })
  }
  if (!d.system_id || !d.deliverable_id || !d.activity_id) {
    return NextResponse.json({ rows: [], totals: { hours: 0, cost: 0 } }, noStore)
  }

  const { data: billRateRows } = await db
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)

  const ratesByUser = new Map<string, BillRateRow[]>()
  for (const br of (billRateRows || []) as BillRateRow[]) {
    if (!br.user_id) continue
    if (!ratesByUser.has(br.user_id)) ratesByUser.set(br.user_id, [])
    ratesByUser.get(br.user_id)!.push(br)
  }

  // Pull entries for this cell only.
  const { data: rawEntries } = await db
    .from('timesheet_entries')
    .select(
      'timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
    )
    .eq('po_id', poId)
    .eq('system_id', d.system_id)
    .eq('deliverable_id', d.deliverable_id)
    .eq('activity_id', d.activity_id)

  const entries = (rawEntries || []) as Array<Record<string, unknown>>
  const tsIds = [...new Set(entries.map((e) => e.timesheet_id as string).filter(Boolean))]
  if (tsIds.length === 0) {
    return NextResponse.json({ rows: [] as CellDetailRow[], totals: { hours: 0, cost: 0 } }, noStore)
  }

  const { data: tsRows } = await db
    .from('weekly_timesheets')
    .select('id, user_id, week_ending')
    .in('id', tsIds)
    .eq('status', 'approved')

  const tsMap = new Map<string, { user_id: string; week_ending: string }>()
  for (const t of (tsRows || []) as Array<{ id: string; user_id: string; week_ending: string }>) {
    tsMap.set(t.id, { user_id: t.user_id, week_ending: t.week_ending })
  }

  const userIds = [...new Set([...tsMap.values()].map((t) => t.user_id))]
  const userNameById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from('user_profiles')
      .select('id, name')
      .in('id', userIds)
    for (const p of (profiles || []) as Array<{ id: string; name: string | null }>) {
      userNameById.set(p.id, p.name ?? '')
    }
  }

  // Aggregate per (timesheet_id, user_id, week) — one row per timesheet,
  // even if the cell has multiple entries on the same timesheet (rare but
  // possible).
  const byTs = new Map<string, CellDetailRow>()
  for (const e of entries) {
    const tsId = e.timesheet_id as string | null | undefined
    if (!tsId) continue
    const ts = tsMap.get(tsId)
    if (!ts) continue
    const hours = sumEntryHours(e)
    if (hours <= 0) continue
    const we = String(ts.week_ending || '').slice(0, 10)
    const userRates = ratesByUser.get(ts.user_id) || []
    const rate = pickEffectiveRateForWeek(userRates, we)
    const cur = byTs.get(tsId) ?? {
      timesheetId: tsId,
      weekEnding: we,
      userId: ts.user_id,
      userName: userNameById.get(ts.user_id) ?? '',
      hours: 0,
      cost: 0,
    }
    cur.hours += hours
    cur.cost += hours * rate
    byTs.set(tsId, cur)
  }

  const rows = [...byTs.values()].sort((a, b) => {
    if (a.weekEnding !== b.weekEnding) return a.weekEnding.localeCompare(b.weekEnding)
    return a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' })
  })
  const totals = rows.reduce((acc, r) => {
    acc.hours += r.hours
    acc.cost += r.cost
    return acc
  }, { hours: 0, cost: 0 })

  return NextResponse.json({ rows, totals }, noStore)
}
