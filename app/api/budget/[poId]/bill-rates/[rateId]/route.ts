import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

async function checkAccess(supabase: any, user: any, poId: string) {
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)
  const { data: po } = await supabase.from('purchase_orders').select('site_id').eq('id', poId).single()
  return !!po && (accessibleSiteIds === null || accessibleSiteIds.includes(po.site_id))
}

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
  if (!(await checkAccess(supabase, user, poId))) {
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
    .select('*, user_profiles!user_id(id, name)')
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
  if (!(await checkAccess(supabase, user, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { error } = await supabase.from('po_bill_rates').delete().eq('id', rateId).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
