import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET: List audit log entries. Admin/Super Admin only. Query: entity_type, action, actor_id, limit, offset */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const action = searchParams.get('action')
  const actorId = searchParams.get('actor_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const supabase = createAdminClient()
  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (entityType) query = query.eq('entity_type', entityType)
  if (action) query = query.eq('action', action)
  if (actorId) query = query.eq('actor_id', actorId)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entries: data || [], total: count ?? 0 })
}
