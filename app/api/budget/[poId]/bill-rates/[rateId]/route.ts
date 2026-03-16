import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ poId: string; rateId: string }> }
) {
  const { poId, rateId } = await params
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
  if (body.rate != null) updates.rate = parseFloat(String(body.rate))
  if (body.effective_from_date != null) updates.effective_from_date = body.effective_from_date

  const { data, error } = await supabase
    .from('po_bill_rates')
    .update(updates)
    .eq('id', rateId)
    .eq('po_id', poId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; rateId: string }> }
) {
  const { poId, rateId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { error } = await supabase.from('po_bill_rates').delete().eq('id', rateId).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
