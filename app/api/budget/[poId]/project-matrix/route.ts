import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { billRateIsActiveOnDate, pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'

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
    const budgetCost = budgeted * blendedRate
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

  return NextResponse.json(
    {
      siteId: po.site_id ?? null,
      costModel: {
        blendedBudgetRate: blendedRate,
        budgetCostLabel:
          'Est. budget $ uses budgeted hours × the average of each team member’s current bill rate on this PO. Actual $ sums approved timesheet hours × that person’s effective rate for each week.',
      },
      rows,
      totals: {
        budgetedHours: totalBudgeted,
        actualHoursInMatrix: totalActualMatrix,
        actualHoursAllEntries: totalAllEntries,
        unmatchedActualHours,
        budgetCost: totalBudgetCost,
        actualCost: totalActualCost,
        costVariance: totalBudgetCost - totalActualCost,
      },
    },
    noStore
  )
}
