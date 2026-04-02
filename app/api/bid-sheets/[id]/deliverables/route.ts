import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { deleteBidSheetItemFromProject, type BidSheetItemRow } from '@/lib/syncBidSheetToProject'

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const desc = typeof body.description === 'string' ? body.description.trim() : ''

  const { data, error } = await supabase
    .from('bid_sheet_deliverables')
    .insert({ bid_sheet_id: id, name, description: desc || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
  const { deliverable_id, name, description } = body as {
    deliverable_id?: string
    name?: string
    description?: string | null
  }
  if (!deliverable_id) return NextResponse.json({ error: 'deliverable_id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof name === 'string') {
    const t = name.trim()
    if (!t) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = t
  }
  if (description !== undefined) {
    updates.description = typeof description === 'string' ? description.trim() || null : null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bid_sheet_deliverables')
    .update(updates)
    .eq('id', deliverable_id)
    .eq('bid_sheet_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: bidSheetId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, bidSheetId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const deliverableId = new URL(req.url).searchParams.get('deliverable_id')
  if (!deliverableId) return NextResponse.json({ error: 'deliverable_id is required' }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: sheet } = await admin.from('bid_sheets').select('site_id, status, converted_po_id').eq('id', bidSheetId).single()
  const { data: rows } = await admin
    .from('bid_sheet_items')
    .select(
      `
      *,
      bid_sheet_systems (id, name, code),
      bid_sheet_deliverables (id, name),
      bid_sheet_activities (id, name)
    `
    )
    .eq('bid_sheet_id', bidSheetId)
    .eq('bid_sheet_deliverable_id', deliverableId)

  try {
    if (sheet?.status === 'converted' && sheet.converted_po_id && sheet.site_id && rows?.length) {
      for (const r of rows) {
        await deleteBidSheetItemFromProject(admin, sheet.site_id, sheet.converted_po_id, r as BidSheetItemRow)
      }
    }
    await admin.from('bid_sheet_items').delete().eq('bid_sheet_id', bidSheetId).eq('bid_sheet_deliverable_id', deliverableId)
    const { error } = await admin.from('bid_sheet_deliverables').delete().eq('id', deliverableId).eq('bid_sheet_id', bidSheetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete deliverable'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
