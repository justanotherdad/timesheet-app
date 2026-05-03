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

type EmployeeTimesheetRow = {
  timesheetId: string
  weekEnding: string
  status: string
  hoursOnPo: number
  costOnPo: number
}

/**
 * GET /api/budget/[poId]/individual/[userId]/timesheets
 *
 * Returns every timesheet that this user logged any hours on this PO for —
 * approved or otherwise. Each row carries the totals **on this PO only**
 * (so the modal cleanly answers "how much did this person bill us on this
 * project, by week"). Rows link to /dashboard/timesheets/[id] in the UI.
 *
 * Cost is computed only for hours from approved timesheets (matches the
 * matrix view); for other statuses cost is 0 because rates only apply once
 * the week is approved.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string; userId: string }> }
) {
  const { poId, userId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

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

  const { data: profile } = await db
    .from('user_profiles')
    .select('id, name, title')
    .eq('id', userId)
    .maybeSingle()

  // Pull every timesheet (regardless of status) belonging to this user, then
  // intersect with timesheet_entries on this PO so we know which weeks are
  // relevant. This avoids dragging in timesheets that have nothing to do
  // with this project.
  const { data: tsRows } = await db
    .from('weekly_timesheets')
    .select('id, status, week_ending')
    .eq('user_id', userId)

  const tsList = (tsRows || []) as Array<{ id: string; status: string; week_ending: string }>
  if (tsList.length === 0) {
    return NextResponse.json(
      { user: profile, rows: [] as EmployeeTimesheetRow[], totals: { hours: 0, cost: 0 } },
      noStore
    )
  }

  const tsById = new Map<string, { status: string; week_ending: string }>()
  for (const t of tsList) tsById.set(t.id, { status: t.status, week_ending: t.week_ending })

  const { data: rawEntries } = await db
    .from('timesheet_entries')
    .select(
      'timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
    )
    .eq('po_id', poId)
    .in('timesheet_id', [...tsById.keys()])

  const { data: billRateRows } = await db
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)
    .eq('user_id', userId)

  const userRates = ((billRateRows || []) as BillRateRow[]).filter((br) => br.user_id === userId)

  // Aggregate per timesheet
  const byTs = new Map<string, EmployeeTimesheetRow>()
  for (const e of (rawEntries || []) as Array<Record<string, unknown>>) {
    const tsId = e.timesheet_id as string | null | undefined
    if (!tsId) continue
    const ts = tsById.get(tsId)
    if (!ts) continue
    const hours = sumEntryHours(e)
    if (hours <= 0) continue

    const we = String(ts.week_ending || '').slice(0, 10)
    const isApproved = ts.status === 'approved'
    const rate = isApproved ? pickEffectiveRateForWeek(userRates, we) : 0
    const cur = byTs.get(tsId) ?? {
      timesheetId: tsId,
      weekEnding: we,
      status: ts.status,
      hoursOnPo: 0,
      costOnPo: 0,
    }
    cur.hoursOnPo += hours
    cur.costOnPo += hours * rate
    byTs.set(tsId, cur)
  }

  const rows = [...byTs.values()].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))
  const totals = rows.reduce((acc, r) => {
    acc.hours += r.hoursOnPo
    acc.cost += r.costOnPo
    return acc
  }, { hours: 0, cost: 0 })

  return NextResponse.json(
    {
      user: profile,
      rows,
      totals,
    },
    noStore
  )
}
