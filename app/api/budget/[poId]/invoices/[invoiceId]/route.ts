import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

/** PO Balance = total budget - invoices only. Prior amount spent affects Budget Balance, not PO Balance. */
async function updatePoBalance(supabase: any, poId: string) {
  const { data: po } = await supabase.from('purchase_orders').select('original_po_amount').eq('id', poId).single()
  const { data: cos } = await supabase.from('po_change_orders').select('amount, type').eq('po_id', poId)
  const { data: invs } = await supabase.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const coTotal = (cos || []).filter((c: any) => (c.type || 'co') === 'co').reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const invTotal = (invs || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - invTotal

  await supabase.from('purchase_orders').update({ po_balance: runningBalance }).eq('id', poId)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ poId: string; invoiceId: string }> }
) {
  const { poId, invoiceId } = await params
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, any> = {}
  if (body.invoice_date != null) updates.invoice_date = body.invoice_date
  if ('invoice_number' in body) updates.invoice_number = body.invoice_number
  if (Array.isArray(body.periods) && body.periods.length > 0) {
    updates.periods = body.periods.map((p: any) => ({ month: parseInt(String(p.month), 10), year: parseInt(String(p.year), 10) }))
    updates.period_month = updates.periods[0].month
    updates.period_year = updates.periods[0].year
  } else if (body.period_month != null) updates.period_month = parseInt(String(body.period_month), 10)
  else if (body.period_year != null) updates.period_year = parseInt(String(body.period_year), 10)
  if (body.amount != null) updates.amount = parseFloat(String(body.amount))
  if ('payment_received_date' in body) updates.payment_received_date = body.payment_received_date
  if ('notes' in body) updates.notes = body.notes

  const { data, error } = await supabase
    .from('po_invoices')
    .update(updates)
    .eq('id', invoiceId)
    .eq('po_id', poId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await updatePoBalance(supabase, poId)
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; invoiceId: string }> }
) {
  const { poId, invoiceId } = await params
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { error } = await supabase.from('po_invoices').delete().eq('id', invoiceId).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await updatePoBalance(supabase, poId)
  return NextResponse.json({ success: true })
}
