import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Returns each unpaid invoice (no payment_received_date) as its own row, with PO balance; organized by client. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  let purchaseOrders: any[] = []
  if (isAdminOrAbove) {
    const { data } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, site_id, project_name, description, original_po_amount')
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
      .select('id, po_number, site_id, project_name, description, original_po_amount')
      .in('id', poIds)
      .order('po_number')
    purchaseOrders = data || []
  }

  const poIds = purchaseOrders.map((p: any) => p.id)
  if (poIds.length === 0) {
    return NextResponse.json({ rows: [], sites: [] })
  }

  const { data: outstandingInvoices } = await adminSupabase
    .from('po_invoices')
    .select('id, po_id, invoice_number, amount, invoice_date')
    .in('po_id', poIds)
    .is('payment_received_date', null)
    .order('invoice_date', { ascending: true })

  const invsFiltered = (outstandingInvoices || []).filter((i: any) =>
    purchaseOrders.some((p: any) => p.id === i.po_id)
  )

  if (invsFiltered.length === 0) {
    return NextResponse.json({ rows: [], sites: [] })
  }

  const poIdsInReport = [...new Set(invsFiltered.map((i: any) => i.po_id))]

  const { data: cos } = await adminSupabase
    .from('po_change_orders')
    .select('po_id, amount, type')
    .in('po_id', poIdsInReport)
  const { data: allInvs } = await adminSupabase
    .from('po_invoices')
    .select('po_id, amount')
    .in('po_id', poIdsInReport)

  const coByPo: Record<string, number> = {}
  const invByPo: Record<string, number> = {}
  ;(cos || []).forEach((c: any) => {
    if ((c.type || 'co') !== 'co') return
    coByPo[c.po_id] = (coByPo[c.po_id] || 0) + (c.amount || 0)
  })
  ;(allInvs || []).forEach((i: any) => {
    invByPo[i.po_id] = (invByPo[i.po_id] || 0) + (i.amount || 0)
  })

  const poById = purchaseOrders.reduce((acc: Record<string, any>, p: any) => {
    acc[p.id] = p
    return acc
  }, {})

  const siteIds = [...new Set(poIdsInReport.map((id) => poById[id]?.site_id).filter(Boolean))]
  const { data: sites } = await adminSupabase.from('sites').select('id, name').in('id', siteIds)
  const sitesMap = (sites || []).reduce((acc: Record<string, any>, s: any) => {
    acc[s.id] = s
    return acc
  }, {})

  const currentPoBalance = (poId: string) => {
    const po = poById[poId]
    if (!po) return 0
    const original = po.original_po_amount ?? 0
    const coTotal = coByPo[poId] ?? 0
    const invTotal = invByPo[poId] ?? 0
    return original + coTotal - invTotal
  }

  const rows = invsFiltered.map((inv: any) => {
    const po = poById[inv.po_id]
    const siteId = po?.site_id
    return {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number ?? '',
      invoice_amount: Number(inv.amount) || 0,
      invoice_date: inv.invoice_date ?? null,
      po_id: inv.po_id,
      po_number: po?.po_number || '—',
      project_name: po?.project_name || po?.description || '—',
      current_po_balance: currentPoBalance(inv.po_id),
      client: sitesMap[siteId]?.name || '—',
      site_id: siteId,
    }
  })

  rows.sort((a: any, b: any) => {
    const c = (a.client || '').localeCompare(b.client || '')
    if (c !== 0) return c
    const p = (a.po_number || '').localeCompare(b.po_number || '')
    if (p !== 0) return p
    const da = a.invoice_date || ''
    const db = b.invoice_date || ''
    return da.localeCompare(db)
  })

  return NextResponse.json({ rows, sites: Object.values(sitesMap) })
}
