import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
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
  const { expense_type_id, custom_type_name, amount, expense_date, notes } = body

  if (amount == null || !expense_date) {
    return NextResponse.json({ error: 'amount and expense_date are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('po_expenses')
    .insert({
      po_id: poId,
      expense_type_id: expense_type_id || null,
      custom_type_name: custom_type_name || null,
      amount: parseFloat(String(amount)),
      expense_date,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
