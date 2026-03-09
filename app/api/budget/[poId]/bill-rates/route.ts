import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessibleSiteIds } from '@/lib/access'
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

  const db = (() => { try { return createAdminClient() } catch { return supabase } })()

  const { data, error } = await db
    .from('po_bill_rates')
    .upsert(
      {
        po_id: poId,
        user_id,
        rate: parseFloat(String(rate)),
        effective_from_date,
      },
      {
        onConflict: 'po_id,user_id,effective_from_date',
        ignoreDuplicates: false,
      }
    )
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
