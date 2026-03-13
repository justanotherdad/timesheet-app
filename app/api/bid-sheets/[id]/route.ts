import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { getAccessibleBidSheetIds } from '@/lib/access'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function canAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, role: string, bidSheetId: string): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase.from('bid_sheet_access').select('user_id').eq('bid_sheet_id', bidSheetId).eq('user_id', userId).maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase.from('user_sites').select('site_id').eq('user_id', userId).eq('site_id', sheet.site_id).maybeSingle()
  return !!siteAccess
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const db = ['admin', 'super_admin'].includes(user.profile.role) ? createAdminClient() : supabase

  const [sheetRes, itemsRes, laborRes, indirectRes] = await Promise.all([
    db.from('bid_sheets').select('*, sites(id, name)').eq('id', id).single(),
    db.from('bid_sheet_items').select('*, systems(id, name, code), deliverables(id, name), activities(id, name)').eq('bid_sheet_id', id),
    db.from('bid_sheet_labor').select('*, user_profiles(id, name)').eq('bid_sheet_id', id),
    db.from('bid_sheet_indirect_labor').select('*').eq('bid_sheet_id', id),
  ])

  if (sheetRes.error || !sheetRes.data) return NextResponse.json({ error: 'Bid sheet not found' }, { status: 404 })

  return NextResponse.json({
    sheet: sheetRes.data,
    items: itemsRes.data || [],
    labor: laborRes.data || [],
    indirectLabor: indirectRes.data || [],
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const body = await req.json()
  const { name, description } = body
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No updates' }, { status: 400 })

  const { data, error } = await supabase.from('bid_sheets').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const db = createAdminClient()
  const { data: sheet } = await db.from('bid_sheets').select('name').eq('id', id).single()
  const { error } = await db.from('bid_sheets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({
    actorId: user.id,
    actorName: user.profile?.name,
    action: 'bid_sheet.delete',
    entityType: 'bid_sheet',
    entityId: id,
    oldValues: { name: sheet?.name },
  })
  return NextResponse.json({ ok: true })
}
