import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

/** Syncs po_balance from running balance and returns balance + budget_balance */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id, original_po_amount, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  const { data: cos } = await supabase.from('po_change_orders').select('amount').eq('po_id', poId)
  const { data: invs } = await supabase.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const coTotal = (cos || []).reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const invTotal = (invs || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - invTotal

  await supabase.from('purchase_orders').update({ po_balance: runningBalance }).eq('id', poId)

  const { data: billRates } = await supabase
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date')
    .eq('po_id', poId)
    .order('effective_from_date', { ascending: false })

  const { data: entries } = await supabase
    .from('timesheet_entries')
    .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .eq('po_id', poId)

  const tsIds = [...new Set((entries || []).map((e: any) => e.timesheet_id).filter(Boolean))]
  const { data: timesheets } = tsIds.length > 0
    ? await supabase
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
    const userRates = (billRates || [])
      .filter((br: any) => br.user_id === userId && (br.effective_from_date || '') <= dateStr)
      .sort((a: any, b: any) => (b.effective_from_date || '').localeCompare(a.effective_from_date || ''))
    return userRates[0]?.rate ?? 0
  }

  let laborCost = 0
  for (const [uid, weekData] of Object.entries(hoursByUserWeek)) {
    for (const [weekEnding, hours] of Object.entries(weekData)) {
      if (hours > 0) laborCost += getEffectiveRate(uid, weekEnding) * hours
    }
  }

  const priorHours = po?.prior_hours_billed ?? 0
  const priorRate = po?.prior_hours_billed_rate ?? 0
  const priorAmountSpent = po?.prior_amount_spent ?? 0
  const priorCostFromHours = priorHours * priorRate
  const totalAvailable = original + coTotal
  const budgetBalance = totalAvailable - priorAmountSpent - priorCostFromHours - laborCost

  return NextResponse.json({ balance: runningBalance, budgetBalance, lastTimesheetWe })
}
