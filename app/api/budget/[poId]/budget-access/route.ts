import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** GET: List users with budget access for this PO. ?available=1 returns all users with profiles (for Add dropdown). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const { searchParams } = new URL(req.url)
  const available = searchParams.get('available') === '1'

  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  if (available) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, name')
      .not('name', 'is', null)
      .order('name')
    const users = (profiles || []).map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
    return NextResponse.json({ users })
  }

  const { data: accessRows } = await supabase
    .from('po_budget_access')
    .select('user_id')
    .eq('purchase_order_id', poId)

  const userIds = [...new Set((accessRows || []).map((r: any) => r.user_id).filter(Boolean))]
  let users: Array<{ id: string; name: string }> = []
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, name')
      .in('id', userIds)
      .order('name')
    users = (profiles || []).map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
  }

  return NextResponse.json({ users })
}

/** POST: Grant budget access to a user (admin only) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  const body = await req.json()
  const { userId } = body
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('po_budget_access')
    .insert({ user_id: userId, purchase_order_id: poId })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true }) // already granted
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE: Revoke budget access. Body: { userId } */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('po_budget_access')
    .delete()
    .eq('purchase_order_id', poId)
    .eq('user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  logAudit({
    actorId: user.id,
    actorName: user.profile?.name,
    action: 'budget.access.revoke',
    entityType: 'po_budget_access',
    entityId: poId,
    oldValues: { purchase_order_id: poId, user_id: userId },
  })
  return NextResponse.json({ ok: true })
}
