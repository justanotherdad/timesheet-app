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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
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
  const { invoice_date, invoice_number, period_month, period_year, amount, payment_received_date, notes } = body

  if (!invoice_date || period_month == null || period_year == null || amount == null) {
    return NextResponse.json({ error: 'invoice_date, period_month, period_year, and amount are required' }, { status: 400 })
  }

  const { data: inv, error } = await supabase
    .from('po_invoices')
    .insert({
      po_id: poId,
      invoice_date,
      invoice_number: invoice_number || null,
      period_month: parseInt(String(period_month), 10),
      period_year: parseInt(String(period_year), 10),
      amount: parseFloat(String(amount)),
      payment_received_date: payment_received_date || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await updatePoBalance(supabase, poId)
  return NextResponse.json(inv)
}
