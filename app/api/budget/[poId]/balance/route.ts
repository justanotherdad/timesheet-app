import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Syncs po_balance from running balance and returns balance + budget_balance */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const rawId = (await params).poId
  const poId = typeof rawId === 'string' ? rawId.trim() : ''
  if (!poId) {
    return NextResponse.json({ error: 'Missing PO id' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch {
    /* service role optional */
  }

  const poSelect = 'site_id, original_po_amount, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate'

  async function fetchPoRow(client: SupabaseClient) {
    const { data } = await client.from('purchase_orders').select(poSelect).eq('id', poId).maybeSingle()
    return data
  }

  let po = null as Awaited<ReturnType<typeof fetchPoRow>>
  if (adminSupabase) {
    po = await fetchPoRow(adminSupabase)
  }
  if (!po) {
    po = await fetchPoRow(supabase)
  }

  if (!po) {
    if (!adminSupabase) {
      return NextResponse.json(
        {
          error:
            'Could not load this PO (session read blocked). Set SUPABASE_SERVICE_ROLE_KEY on the server so budget APIs can read purchase orders.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  const { data: cos } = await supabase
    .from('po_change_orders')
    .select('amount, type, line_item_type, user_id')
    .eq('po_id', poId)
  const { data: invs } = await supabase.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const changeOrderRows = cos || []
  const coTotal = changeOrderRows.filter((c: any) => (c.type || 'co') === 'co').reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const liTotal = changeOrderRows.filter((c: any) => c.type === 'li').reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const invTotal = (invs || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - invTotal

  await supabase.from('purchase_orders').update({ po_balance: runningBalance }).eq('id', poId)

  const { data: billRates } = await supabase
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)
    .order('effective_from_date', { ascending: false })

  // Use admin client for timesheet rows so Budget Balance matches billable-hours / UI.
  // RLS on timesheet_entries would otherwise hide other employees' rows for grantees.
  let dbLabor = adminSupabase ?? supabase
  if (!adminSupabase) {
    try {
      dbLabor = createAdminClient()
    } catch {
      dbLabor = supabase
    }
  }

  const { data: entries } = await dbLabor
    .from('timesheet_entries')
    .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .eq('po_id', poId)

  const tsIds = [...new Set((entries || []).map((e: any) => e.timesheet_id).filter(Boolean))]
  const { data: timesheets } = tsIds.length > 0
    ? await dbLabor
        .from('weekly_timesheets')
        .select('id, user_id, week_ending')
        .in('id', tsIds)
        .eq('status', 'approved')
    : { data: [] }

  const hoursByUserWeek: Record<string, Record<string, number>> = {}
  let lastTimesheetWe: string | null = null
  for (const ts of timesheets || []) {
    const tsEntries = (entries || []).filter((e: any) => e.timesheet_id === ts.id)
    const totalHours = tsEntries.reduce((sum: number, e: any) => {
      return sum + (e.mon_hours || 0) + (e.tue_hours || 0) + (e.wed_hours || 0) +
        (e.thu_hours || 0) + (e.fri_hours || 0) + (e.sat_hours || 0) + (e.sun_hours || 0)
    }, 0)
    if (totalHours > 0) {
      const uid = ts.user_id
      const we = ts.week_ending
      if (!hoursByUserWeek[uid]) hoursByUserWeek[uid] = {}
      hoursByUserWeek[uid][we] = (hoursByUserWeek[uid][we] || 0) + totalHours
      if (we && (!lastTimesheetWe || we > lastTimesheetWe)) lastTimesheetWe = we
    }
  }

  const getEffectiveRate = (userId: string, dateStr: string) => {
    const userRows = (billRates || []).filter((br: any) => br.user_id === userId)
    return pickEffectiveRateForWeek(userRows, dateStr)
  }

  const laborCostByUser: Record<string, number> = {}
  let laborCost = 0
  for (const [uid, weekData] of Object.entries(hoursByUserWeek)) {
    let userCost = 0
    for (const [weekEnding, hours] of Object.entries(weekData)) {
      if (hours > 0) {
        const cost = getEffectiveRate(uid, weekEnding) * hours
        laborCost += cost
        userCost += cost
      }
    }
    laborCostByUser[uid] = userCost
  }

  const priorHours = po?.prior_hours_billed ?? 0
  const priorRate = po?.prior_hours_billed_rate ?? 0
  const priorAmountSpent = po?.prior_amount_spent ?? 0
  const priorCostFromHours = priorHours * priorRate
  const totalAvailable = original + coTotal + liTotal
  const budgetBalance = totalAvailable - priorAmountSpent - priorCostFromHours - laborCost

  const personnelLIs = changeOrderRows.filter((c: any) => c.type === 'li' && c.line_item_type === 'personnel' && c.user_id)
  const personnelUserIds = [...new Set(personnelLIs.map((c: any) => c.user_id))]
  const { data: profiles } = personnelUserIds.length > 0
    ? await supabase.from('user_profiles').select('id, name').in('id', personnelUserIds)
    : { data: [] }
  const profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, { id: p.id, name: p.name || 'Unknown' }]))

  const personnelLineItems = personnelLIs.map((li: any) => {
    const allocated = li.amount || 0
    const spent = laborCostByUser[li.user_id] ?? 0
    const remaining = Math.max(0, allocated - spent)
    const profile = profilesMap[li.user_id]
    return {
      user_id: li.user_id,
      userName: profile?.name ?? 'Unknown',
      allocated,
      spent,
      remaining,
    }
  })

  return NextResponse.json({
    balance: runningBalance,
    budgetBalance,
    lastTimesheetWe,
    totalAvailable,
    personnelLineItems,
  })
}
