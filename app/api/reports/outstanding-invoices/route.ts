import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Returns POs that have at least one invoice without payment_received_date, organized by client. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  // Get accessible POs (same logic as budget page)
  let purchaseOrders: any[] = []
  if (isAdminOrAbove) {
    const { data } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, site_id, project_name, original_po_amount, po_balance, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate')
      .order('po_number')
    purchaseOrders = data || []
  } else {
    const { data: accessRows } = await supabase
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const poIds = (accessRows || []).map((r: any) => r.purchase_order_id).filter(Boolean)
    if (poIds.length === 0) {
      return NextResponse.json({ rows: [], sites: [] })
    }
    const { data } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, site_id, project_name, original_po_amount, po_balance, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate')
      .in('id', poIds)
      .order('po_number')
    purchaseOrders = data || []
  }

  // Get invoices without payment_received_date
  const poIds = purchaseOrders.map((p: any) => p.id)
  if (poIds.length === 0) {
    return NextResponse.json({ rows: [], sites: [] })
  }

  const { data: outstandingInvs } = await adminSupabase
    .from('po_invoices')
    .select('po_id')
    .in('po_id', poIds)
    .is('payment_received_date', null)
  const poIdsWithOutstanding = [...new Set((outstandingInvs || []).map((i: any) => i.po_id))]

  // Filter to POs that have outstanding invoices
  const posToReport = purchaseOrders.filter((p: any) => poIdsWithOutstanding.includes(p.id))
  if (posToReport.length === 0) {
    return NextResponse.json({ rows: [], sites: [] })
  }

  const siteIds = [...new Set(posToReport.map((p: any) => p.site_id).filter(Boolean))]
  const { data: sites } = await adminSupabase
    .from('sites')
    .select('id, name')
    .in('id', siteIds)
  const sitesMap = (sites || []).reduce((acc: Record<string, any>, s: any) => {
    acc[s.id] = s
    return acc
  }, {})

  const { data: cos } = await adminSupabase.from('po_change_orders').select('po_id, amount').in('po_id', posToReport.map((p: any) => p.id))
  const { data: invs } = await adminSupabase.from('po_invoices').select('po_id, amount').in('po_id', posToReport.map((p: any) => p.id))
  const coByPo: Record<string, number> = {}
  const invByPo: Record<string, number> = {}
  ;(cos || []).forEach((c: any) => { coByPo[c.po_id] = (coByPo[c.po_id] || 0) + (c.amount || 0) })
  ;(invs || []).forEach((i: any) => { invByPo[i.po_id] = (invByPo[i.po_id] || 0) + (i.amount || 0) })

  // Budget balance requires bill rates and timesheet entries
  const { data: billRates } = await adminSupabase.from('po_bill_rates').select('po_id, user_id, rate, effective_from_date').in('po_id', posToReport.map((p: any) => p.id))
  const { data: entries } = await adminSupabase.from('timesheet_entries').select('po_id, timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours').in('po_id', posToReport.map((p: any) => p.id))
  const tsIds = [...new Set((entries || []).map((e: any) => e.timesheet_id).filter(Boolean))]
  const { data: timesheets } = tsIds.length > 0
    ? await adminSupabase.from('weekly_timesheets').select('id, user_id, week_ending').in('id', tsIds).eq('status', 'approved')
    : { data: [] }

  const getEffectiveRate = (poId: string, userId: string, dateStr: string) => {
    const rates = (billRates || []).filter((br: any) => br.po_id === poId && br.user_id === userId && (br.effective_from_date || '') <= dateStr)
      .sort((a: any, b: any) => (b.effective_from_date || '').localeCompare(a.effective_from_date || ''))
    return rates[0]?.rate ?? 0
  }

  const tsMap = (timesheets || []).reduce((acc: Record<string, any>, t: any) => { acc[t.id] = t; return acc }, {})
  let laborByPo: Record<string, number> = {}
  for (const entry of entries || []) {
    const ts = tsMap[entry.timesheet_id]
    if (!ts) continue
    const hours = (entry.mon_hours || 0) + (entry.tue_hours || 0) + (entry.wed_hours || 0) + (entry.thu_hours || 0) + (entry.fri_hours || 0) + (entry.sat_hours || 0) + (entry.sun_hours || 0)
    if (hours <= 0) continue
    const rate = getEffectiveRate(entry.po_id, ts.user_id, ts.week_ending || '')
    laborByPo[entry.po_id] = (laborByPo[entry.po_id] || 0) + rate * hours
  }

  const rows = posToReport.map((po: any) => {
    const original = po.original_po_amount ?? 0
    const coTotal = coByPo[po.id] ?? 0
    const invTotal = invByPo[po.id] ?? 0
    const poBalance = original + coTotal - invTotal
    const totalAvailable = original + coTotal
    const priorCost = (po.prior_hours_billed ?? 0) * (po.prior_hours_billed_rate ?? 0) + (po.prior_amount_spent ?? 0)
    const laborCost = laborByPo[po.id] ?? 0
    const budgetBalance = totalAvailable - priorCost - laborCost

    return {
      client: sitesMap[po.site_id]?.name || '—',
      site_id: po.site_id,
      po_number: po.po_number || '—',
      project_name: po.project_name || '—',
      original_po_amount: original + coTotal,
      current_po_balance: poBalance,
      current_budget_balance: budgetBalance,
    }
  })

  // Sort by client, then PO number
  rows.sort((a: any, b: any) => {
    const c = (a.client || '').localeCompare(b.client || '')
    return c !== 0 ? c : (a.po_number || '').localeCompare(b.po_number || '')
  })

  return NextResponse.json({ rows, sites: Object.values(sitesMap) })
}
