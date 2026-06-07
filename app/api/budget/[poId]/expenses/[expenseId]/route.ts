import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import {
  buildExpenseDeletedDescription,
  buildExpenseUpdatedDescription,
  fetchExpenseTypeNames,
  logPoBudgetContainerAudit,
} from '@/lib/po-budget-container-audit'

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

  const { data: existing, error: existingErr } = await supabase
    .from('po_expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('po_id', poId)
    .maybeSingle()

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
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
  const typeNames = await fetchExpenseTypeNames(supabase, [existing.expense_type_id, data.expense_type_id].filter(Boolean))
  void logPoBudgetContainerAudit({
    poId,
    container: 'expenses',
    actorId: user.id,
    actorName: user.profile.name,
    description: buildExpenseUpdatedDescription(existing, data, typeNames),
  })
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

  const { data: existing, error: existingErr } = await supabase
    .from('po_expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('po_id', poId)
    .maybeSingle()

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const { error } = await supabase.from('po_expenses').delete().eq('id', expenseId).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const typeNames = await fetchExpenseTypeNames(supabase, [existing.expense_type_id].filter(Boolean))
  void logPoBudgetContainerAudit({
    poId,
    container: 'expenses',
    actorId: user.id,
    actorName: user.profile.name,
    description: buildExpenseDeletedDescription(existing, typeNames),
  })
  return NextResponse.json({ success: true })
}
