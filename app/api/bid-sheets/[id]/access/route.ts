import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function canAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  bidSheetId: string
): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase
    .from('bid_sheet_access')
    .select('user_id')
    .eq('bid_sheet_id', bidSheetId)
    .eq('user_id', userId)
    .maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase
    .from('user_sites')
    .select('site_id')
    .eq('user_id', userId)
    .eq('site_id', sheet.site_id)
    .maybeSingle()
  return !!siteAccess
}

/** GET: List users with bid sheet access. ?available=1 returns all users for add dropdown. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const available = searchParams.get('available') === '1'

  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  if (available) {
    const adminSupabase = createAdminClient()
    const { data: profiles } = await adminSupabase
      .from('user_profiles')
      .select('id, name')
      .not('name', 'is', null)
      .order('name')
    const users = (profiles || []).map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
    return NextResponse.json({ users })
  }

  const { data: accessRows } = await supabase
    .from('bid_sheet_access')
    .select('user_id')
    .eq('bid_sheet_id', id)

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

/** POST: Grant bid sheet access to a user */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const body = await req.json()
  const { userId } = body
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('bid_sheet_access')
    .insert({ user_id: userId, bid_sheet_id: id })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true }) // already granted
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE: Revoke bid sheet access. Query: ?userId=... */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('bid_sheet_access')
    .delete()
    .eq('bid_sheet_id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
