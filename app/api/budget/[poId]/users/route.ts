import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** GET: All users with profiles for bill rate dropdown. Uses admin client to bypass RLS. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as string

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  const allowed = await canAccessPoBudget(supabase, user.id, role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let profilesClient = supabase
  try {
    profilesClient = createAdminClient()
  } catch {
    // Fall back to regular client if admin unavailable
  }

  const { data: profiles } = await profilesClient
    .from('user_profiles')
    .select('id, name')
    .order('name')

  const users = (profiles || [])
    .filter((p: any) => p?.name)
    .map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))

  return NextResponse.json({ users })
}
