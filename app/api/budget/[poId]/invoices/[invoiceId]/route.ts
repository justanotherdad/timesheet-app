import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

async function updatePoBalance(supabase: any, poId: string) {
  const { data: po } = await supabase.from('purchase_orders').select('original_po_amount, prior_amount_spent').eq('id', poId).single()
  const { data: cos } = await supabase.from('po_change_orders').select('amount').eq('po_id', poId)
  const { data: invs } = await supabase.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const coTotal = (cos || []).reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const prior = po?.prior_amount_spent ?? 0
  const invTotal = (invs || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - prior - invTotal

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
  if (body.invoice_number != null) updates.invoice_number = body.invoice_number
  if (body.period_month != null) updates.period_month = parseInt(String(body.period_month), 10)
  if (body.period_year != null) updates.period_year = parseInt(String(body.period_year), 10)
  if (body.amount != null) updates.amount = parseFloat(String(body.amount))
  if (body.payment_received_date != null) updates.payment_received_date = body.payment_received_date
  if (body.notes != null) updates.notes = body.notes

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
