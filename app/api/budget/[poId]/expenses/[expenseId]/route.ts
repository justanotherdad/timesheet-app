import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ poId: string; expenseId: string }> }
) {
  const { poId, expenseId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, any> = {}
  if (body.expense_type_id != null) updates.expense_type_id = body.expense_type_id
  if (body.custom_type_name != null) updates.custom_type_name = body.custom_type_name
  if (body.amount != null) updates.amount = parseFloat(String(body.amount))
  if (body.expense_date != null) updates.expense_date = body.expense_date
  if (body.notes != null) updates.notes = body.notes

  const { data, error } = await supabase
    .from('po_expenses')
    .update(updates)
    .eq('id', expenseId)
    .eq('po_id', poId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; expenseId: string }> }
) {
  const { poId, expenseId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { error } = await supabase.from('po_expenses').delete().eq('id', expenseId).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
