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

  const { data: existing, error: existingErr } = await supabase
    .from('po_bill_rates')
    .select('id, effective_from_date, effective_to_date')
    .eq('id', rateId)
    .eq('po_id', poId)
    .maybeSingle()

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Bill rate not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (body.rate != null) updates.rate = parseFloat(String(body.rate))
  if (body.effective_from_date != null) updates.effective_from_date = body.effective_from_date

  if (body.effective_to_date !== undefined) {
    const raw = body.effective_to_date
    if (raw === null || raw === '') {
      updates.effective_to_date = null
    } else {
      updates.effective_to_date = String(raw).slice(0, 10)
    }
  }

  const finalFrom = String(
    (updates.effective_from_date as string | undefined) ?? existing.effective_from_date ?? ''
  ).slice(0, 10)
  const finalTo =
    updates.effective_to_date !== undefined
      ? updates.effective_to_date === null
        ? null
        : String(updates.effective_to_date).slice(0, 10)
      : existing.effective_to_date != null && existing.effective_to_date !== ''
        ? String(existing.effective_to_date).slice(0, 10)
        : null

  if (finalTo != null && finalTo !== '' && finalFrom && finalTo < finalFrom) {
    return NextResponse.json(
      { error: 'effective_to_date must be on or after effective_from_date' },
      { status: 400 }
    )
  }

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
