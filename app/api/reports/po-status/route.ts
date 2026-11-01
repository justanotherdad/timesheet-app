import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const ID_CHUNK = 100

const PO_COLUMNS =
  'id, po_number, site_id, project_name, description, original_po_amount, po_issue_date, po_balance, prior_amount_spent, prior_hours_billed, prior_hours_billed_rate, active'

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/** PostgREST returns at most ~1000 rows per request. Page until a short page. */
async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return out
}

/** Chunk an id list so `.in()` stays under URL limits, and page each chunk. */
async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    out.push(...(await fetchAllPages((from, to) => run(chunk, from, to))))
  }
  return out
}

/** Returns PO status report data: Client, PO #, Original PO + date, COs + dates, Total Invoiced, Total Paid, Total Outstanding, PO Balance, Budget Balance. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const includeDeactivated = searchParams.get('includeDeactivated') === 'true'
  const filterClient = searchParams.get('client') || ''
  const filterPO = searchParams.get('po') || ''

  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  try {
    let purchaseOrders: any[] = []
    if (isAdminOrAbove) {
      purchaseOrders = await fetchAllPages((from, to) =>
        adminSupabase
          .from('purchase_orders')
          .select(PO_COLUMNS)
          .order('id', { ascending: true })
          .range(from, to)
      )
    } else {
      const accessRows = await fetchAllPages<{ purchase_order_id: string }>((from, to) =>
        supabase
          .from('po_budget_access')
          .select('purchase_order_id')
          .eq('user_id', user.id)
          .order('purchase_order_id', { ascending: true })
          .range(from, to)
      )
      const grantedIds = [...new Set(accessRows.map((r) => r.purchase_order_id).filter(Boolean))]
      if (grantedIds.length === 0) {
        return NextResponse.json({ rows: [], clients: [], purchaseOrders: [] })
      }
      purchaseOrders = await fetchInChunks(grantedIds, (ids, from, to) =>
        adminSupabase
          .from('purchase_orders')
          .select(PO_COLUMNS)
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to)
      )
    }

    if (!includeDeactivated) {
      purchaseOrders = purchaseOrders.filter((p: any) => p.active !== false)
    }
    purchaseOrders.sort((a, b) =>
      String(a.po_number || '').localeCompare(String(b.po_number || ''), undefined, { numeric: true })
    )

    const poIds = purchaseOrders.map((p: any) => p.id)
    if (poIds.length === 0) {
      return NextResponse.json({ rows: [], clients: [], purchaseOrders: [] })
    }

    const siteIds = [...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean))] as string[]
    const sites = await fetchInChunks<{ id: string; name: string }>(siteIds, (ids, from, to) =>
      adminSupabase.from('sites').select('id, name').in('id', ids).order('id', { ascending: true }).range(from, to)
    )
    const sitesMap = sites.reduce((acc: Record<string, { id: string; name: string }>, s) => {
      acc[s.id] = s
      return acc
    }, {})

    const cos = await fetchInChunks<{
      po_id: string
      co_number: string | null
      co_date: string | null
      amount: number | null
      type: string | null
    }>(poIds, (ids, from, to) =>
      adminSupabase
        .from('po_change_orders')
        .select('po_id, co_number, co_date, amount, type')
        .in('po_id', ids)
        .order('id', { ascending: true })
        .range(from, to)
    )
    const invs = await fetchInChunks<{
      po_id: string
      amount: number | null
      payment_received_date: string | null
    }>(poIds, (ids, from, to) =>
      adminSupabase
        .from('po_invoices')
        .select('po_id, amount, payment_received_date')
        .in('po_id', ids)
        .order('id', { ascending: true })
        .range(from, to)
    )
    const expenses = await fetchInChunks<{ po_id: string; amount: number | null }>(poIds, (ids, from, to) =>
      adminSupabase
        .from('po_expenses')
        .select('po_id, amount')
        .in('po_id', ids)
        .order('id', { ascending: true })
        .range(from, to)
    )
    const billRates = await fetchInChunks<{
      po_id: string
      user_id: string
      rate: number | null
      effective_from_date: string | null
      effective_to_date: string | null
    }>(poIds, (ids, from, to) =>
      adminSupabase
        .from('po_bill_rates')
        .select('po_id, user_id, rate, effective_from_date, effective_to_date')
        .in('po_id', ids)
        .order('id', { ascending: true })
        .range(from, to)
    )
    const entries = await fetchInChunks<{
      po_id: string
      timesheet_id: string
      mon_hours: number | null
      tue_hours: number | null
      wed_hours: number | null
      thu_hours: number | null
      fri_hours: number | null
      sat_hours: number | null
      sun_hours: number | null
    }>(poIds, (ids, from, to) =>
      adminSupabase
        .from('timesheet_entries')
        .select('po_id, timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
        .in('po_id', ids)
        .order('id', { ascending: true })
        .range(from, to)
    )

    const tsIds = [...new Set(entries.map((e) => e.timesheet_id).filter(Boolean))]
    const timesheets =
      tsIds.length > 0
        ? await fetchInChunks<{ id: string; user_id: string; week_ending: string | null }>(tsIds, (ids, from, to) =>
            adminSupabase
              .from('weekly_timesheets')
              .select('id, user_id, week_ending')
              .in('id', ids)
              .eq('status', 'approved')
              .order('id', { ascending: true })
              .range(from, to)
          )
        : []

    const cosByPo: Record<string, { amount: number; type: string | null }[]> = {}
    for (const c of cos) {
      if (!cosByPo[c.po_id]) cosByPo[c.po_id] = []
      cosByPo[c.po_id].push({ amount: Number(c.amount) || 0, type: c.type })
    }

    const invByPo: Record<string, { amount: number; payment_received_date: string | null }[]> = {}
    for (const i of invs) {
      if (!invByPo[i.po_id]) invByPo[i.po_id] = []
      invByPo[i.po_id].push({
        amount: Number(i.amount) || 0,
        payment_received_date: i.payment_received_date,
      })
    }

    const expenseByPo: Record<string, number> = {}
    for (const e of expenses) {
      expenseByPo[e.po_id] = (expenseByPo[e.po_id] || 0) + (Number(e.amount) || 0)
    }

    const getEffectiveRate = (poId: string, userId: string, dateStr: string) => {
      const rates = billRates.filter((br) => br.po_id === poId && br.user_id === userId)
      return pickEffectiveRateForWeek(rates, dateStr)
    }

    const tsMap: Record<string, { id: string; user_id: string; week_ending: string | null }> = {}
    for (const t of timesheets) tsMap[t.id] = t

    const laborByPo: Record<string, number> = {}
    for (const entry of entries) {
      const ts = tsMap[entry.timesheet_id]
      if (!ts) continue
      const hours =
        (entry.mon_hours || 0) +
        (entry.tue_hours || 0) +
        (entry.wed_hours || 0) +
        (entry.thu_hours || 0) +
        (entry.fri_hours || 0) +
        (entry.sat_hours || 0) +
        (entry.sun_hours || 0)
      if (hours <= 0) continue
      const rate = getEffectiveRate(entry.po_id, ts.user_id, ts.week_ending || '')
      laborByPo[entry.po_id] = (laborByPo[entry.po_id] || 0) + rate * hours
    }

    const rows = purchaseOrders.map((po: any) => {
      const original = Number(po.original_po_amount) || 0
      const coList = cosByPo[po.id] || []
      const coTotal = coList.filter((c) => (c.type || 'co') === 'co').reduce((s, c) => s + c.amount, 0)
      const liTotal = coList.filter((c) => c.type === 'li').reduce((s, c) => s + c.amount, 0)
      const invList = invByPo[po.id] || []
      const totalInvoiced = invList.reduce((s, i) => s + i.amount, 0)
      const totalPaid = invList.filter((i) => i.payment_received_date).reduce((s, i) => s + i.amount, 0)
      const totalOutstanding = invList.filter((i) => !i.payment_received_date).reduce((s, i) => s + i.amount, 0)
      const poBalance = original + coTotal - totalInvoiced
      const totalAvailable = original + coTotal + liTotal
      const priorCost =
        (Number(po.prior_hours_billed) || 0) * (Number(po.prior_hours_billed_rate) || 0) +
        (Number(po.prior_amount_spent) || 0)
      const laborCost = laborByPo[po.id] ?? 0
      const expenseTotal = expenseByPo[po.id] ?? 0
      const budgetBalance = totalAvailable - priorCost - laborCost - expenseTotal

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
        active: po.active !== false,
      }
    })

    let filtered = rows
    if (filterClient) filtered = filtered.filter((r) => r.site_id === filterClient)
    if (filterPO) filtered = filtered.filter((r) => r.po_id === filterPO)

    const clients = Object.values(sitesMap)
      .map((s) => ({ id: s.id, name: s.name || '' }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({
      rows: filtered,
      clients,
      purchaseOrders: purchaseOrders.map((p: any) => ({
        id: p.id,
        po_number: p.po_number,
        site_id: p.site_id,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build PO status report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
