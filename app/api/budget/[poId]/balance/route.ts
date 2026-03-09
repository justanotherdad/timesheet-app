import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

/** Syncs po_balance from running balance (original + COs - prior - invoices) and returns it */
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
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id, original_po_amount, prior_amount_spent')
    .eq('id', poId)
    .single()

  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: cos } = await supabase.from('po_change_orders').select('amount').eq('po_id', poId)
  const { data: invs } = await supabase.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const coTotal = (cos || []).reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const prior = po?.prior_amount_spent ?? 0
  const invTotal = (invs || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - prior - invTotal

  await supabase.from('purchase_orders').update({ po_balance: runningBalance }).eq('id', poId)

  return NextResponse.json({ balance: runningBalance })
}
