import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'

export const dynamic = 'force-dynamic'

/** Returns PO status report data: Client, PO #, Original PO + date, COs + dates, Total Invoiced, Total Paid, Total Outstanding, PO Balance, Budget Balance. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const filterYear = searchParams.get('year') || ''
  const filterClient = searchParams.get('client') || ''
  const filterPO = searchParams.get('po') || ''

  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  let purchaseOrders: any[] = []
  if (isAdminOrAbove) {
    const { data } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, site_id, project_name, description, original_po_amount, po_issue_date, po_balance, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate')
      .order('po_number')
    purchaseOrders = data || []
  } else {
    const { data: accessRows } = await supabase
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const poIds = (accessRows || []).map((r: any) => r.purchase_order_id).filter(Boolean)
    if (poIds.length === 0) {
      return NextResponse.json({ rows: [], clients: [], years: [] })
    }
    const { data } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, site_id, project_name, description, original_po_amount, po_issue_date, po_balance, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate')
      .in('id', poIds)
      .order('po_number')
    purchaseOrders = data || []
  }

  const poIds = purchaseOrders.map((p: any) => p.id)
  if (poIds.length === 0) {
    return NextResponse.json({ rows: [], clients: [], years: [] })
  }

  const siteIds = [...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean))]
  const { data: sites } = await adminSupabase.from('sites').select('id, name').in('id', siteIds)
  const sitesMap = (sites || []).reduce((acc: Record<string, any>, s: any) => { acc[s.id] = s; return acc }, {})

  const { data: cos } = await adminSupabase.from('po_change_orders').select('po_id, co_number, co_date, amount').in('po_id', poIds).order('co_date', { ascending: true })
  const { data: invs } = await adminSupabase.from('po_invoices').select('po_id, amount, payment_received_date, invoice_date').in('po_id', poIds)

  const cosByPo: Record<string, { co_number: string; co_date: string; amount: number }[]> = {}
  ;(cos || []).forEach((c: any) => {
    if (!cosByPo[c.po_id]) cosByPo[c.po_id] = []
    cosByPo[c.po_id].push({
      co_number: c.co_number || '',
      co_date: c.co_date || '',
      amount: c.amount ?? 0,
    })
  })

  const invByPo: Record<string, { amount: number; payment_received_date: string | null }[]> = {}
  ;(invs || []).forEach((i: any) => {
    if (!invByPo[i.po_id]) invByPo[i.po_id] = []
    invByPo[i.po_id].push({
      amount: i.amount ?? 0,
      payment_received_date: i.payment_received_date,
    })
  })

  const { data: billRates } = await adminSupabase
    .from('po_bill_rates')
    .select('po_id, user_id, rate, effective_from_date, effective_to_date')
    .in('po_id', poIds)
  const { data: entries } = await adminSupabase.from('timesheet_entries').select('po_id, timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours').in('po_id', poIds)
  const tsIds = [...new Set((entries || []).map((e: any) => e.timesheet_id).filter(Boolean))]
  const { data: timesheets } = tsIds.length > 0
    ? await adminSupabase.from('weekly_timesheets').select('id, user_id, week_ending').in('id', tsIds).eq('status', 'approved')
    : { data: [] }

  const getEffectiveRate = (poId: string, userId: string, dateStr: string) => {
    const rates = (billRates || []).filter((br: any) => br.po_id === poId && br.user_id === userId)
    return pickEffectiveRateForWeek(rates, dateStr)
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

  const years = new Set<string>()
  ;(invs || []).forEach((i: any) => {
    if (i.invoice_date) years.add(String(i.invoice_date).slice(0, 4))
  })
  purchaseOrders.forEach((p: any) => {
    if (p.po_issue_date) years.add(String(p.po_issue_date).slice(0, 4))
  })
  ;(cos || []).forEach((c: any) => {
    if (c.co_date) years.add(String(c.co_date).slice(0, 4))
  })

  const rows = purchaseOrders.map((po: any) => {
    const original = po.original_po_amount ?? 0
    const coList = cosByPo[po.id] || []
    const coTotal = coList.reduce((s, c) => s + c.amount, 0)
    const invList = invByPo[po.id] || []
    const totalInvoiced = invList.reduce((s, i) => s + i.amount, 0)
    const totalPaid = invList.filter((i) => i.payment_received_date).reduce((s, i) => s + i.amount, 0)
    const totalOutstanding = invList.filter((i) => !i.payment_received_date).reduce((s, i) => s + i.amount, 0)
    const poBalance = original + coTotal - totalInvoiced
    const totalAvailable = original + coTotal
    const priorCost = (po.prior_hours_billed ?? 0) * (po.prior_hours_billed_rate ?? 0) + (po.prior_amount_spent ?? 0)
    const laborCost = laborByPo[po.id] ?? 0
    const budgetBalance = totalAvailable - priorCost - laborCost

    return {
      client: sitesMap[po.site_id]?.name || '—',
      site_id: po.site_id,
      po_id: po.id,
      po_number: po.po_number || '—',
      project_name: po.project_name || po.description || '—',
      original_po_amount_incl_cos: original + coTotal,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_outstanding: totalOutstanding,
      po_balance: poBalance,
      budget_balance: budgetBalance,
    }
  })

  // Apply filters
  let filtered = rows
  if (filterYear) {
    filtered = filtered.filter((r: any) => {
      const po = purchaseOrders.find((p: any) => p.id === r.po_id)
      const poYear = po?.po_issue_date ? String(po.po_issue_date).slice(0, 4) : ''
      const hasInvYear = (invs || []).some((i: any) => i.po_id === r.po_id && String(i.invoice_date || '').slice(0, 4) === filterYear)
      const hasCoYear = (cos || []).some((c: any) => c.po_id === r.po_id && String(c.co_date || '').slice(0, 4) === filterYear)
      return poYear === filterYear || hasInvYear || hasCoYear
    })
  }
  if (filterClient) filtered = filtered.filter((r: any) => r.site_id === filterClient)
  if (filterPO) filtered = filtered.filter((r: any) => r.po_id === filterPO)

  const clients = Object.values(sitesMap)
    .map((s: any) => ({ id: s.id, name: s.name || '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({
    rows: filtered,
    clients,
    years: Array.from(years).sort().reverse(),
    purchaseOrders: purchaseOrders.map((p: any) => ({ id: p.id, po_number: p.po_number, site_id: p.site_id })),
  })
}
