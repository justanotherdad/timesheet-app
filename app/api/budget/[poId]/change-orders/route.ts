import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

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

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let data: unknown[] | null = null
  let err: Error | null = null

  try {
    const adminSupabase = createAdminClient()
    const res = await adminSupabase
      .from('po_change_orders')
      .select('*')
      .eq('po_id', poId)
      .order('co_date', { ascending: false })
    data = res.data
    err = res.error
  } catch (e) {
    err = e instanceof Error ? e : new Error(String(e))
  }

  if (err) {
    const { data: fallback } = await supabase
      .from('po_change_orders')
      .select('*')
      .eq('po_id', poId)
      .order('co_date', { ascending: false })
    return NextResponse.json(fallback || [])
  }

  return NextResponse.json(data || [])
}
