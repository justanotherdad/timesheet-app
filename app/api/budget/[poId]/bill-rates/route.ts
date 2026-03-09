import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

function getDb(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    return createAdminClient()
  } catch {
    return supabase
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const { data: po } = await supabase.from('purchase_orders').select('site_id').eq('id', poId).single()
  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const db = getDb(supabase)
  const { data: rows, error } = await db
    .from('po_bill_rates')
    .select('*')
    .eq('po_id', poId)
    .order('effective_from_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((rows || []).map((r: any) => r.user_id).filter(Boolean))]
  let profilesMap: Record<string, { id: string; name: string }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('user_profiles').select('id, name').in('id', userIds)
    profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, { id: p.id, name: p.name }]))
  }

  const data = (rows || []).map((br: any) => ({
    ...br,
    user_profiles: br.user_id && profilesMap[br.user_id] ? profilesMap[br.user_id] : null,
  }))
  return NextResponse.json(data)
}

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
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const { data: po } = await supabase.from('purchase_orders').select('site_id').eq('id', poId).single()
  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, rate, effective_from_date } = body

  if (!user_id || rate == null || !effective_from_date) {
    return NextResponse.json({ error: 'user_id, rate, and effective_from_date are required' }, { status: 400 })
  }

  const db = getDb(supabase)

  const payload = {
    po_id: poId,
    user_id,
    rate: parseFloat(String(rate)),
    effective_from_date,
  }

  let result = await db.from('po_bill_rates').insert(payload).select('*').single()

  if (result.error && (result.error.code === '23505' || result.error.message?.includes('duplicate key'))) {
    const updateRes = await db
      .from('po_bill_rates')
      .update({ rate: payload.rate })
      .eq('po_id', poId)
      .eq('user_id', user_id)
      .eq('effective_from_date', effective_from_date)
      .select('*')
      .single()
    if (!updateRes.error) return NextResponse.json(updateRes.data)
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'Failed to save bill rate' }, { status: 500 })
  return NextResponse.json(result.data)
}
