import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  deleteBidSheetItemFromProject,
  renameSystemForProject,
  type BidSheetItemRow,
} from '@/lib/syncBidSheetToProject'

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
  const { name, code, description } = body
  const trimmedName = (name || '').trim()
  if (!trimmedName) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const desc = typeof description === 'string' ? description.trim() : ''
  const { data, error } = await supabase
    .from('bid_sheet_systems')
    .insert({
      bid_sheet_id: id,
      name: trimmedName,
      code: (code || '').trim() || null,
      description: desc || null,
    })
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
  const { system_id, name, code, description } = body as {
    system_id?: string
    name?: string
    code?: string | null
    description?: string | null
  }
  if (!system_id) return NextResponse.json({ error: 'system_id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof name === 'string') {
    const t = name.trim()
    if (!t) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = t
  }
  if (code !== undefined) updates.code = typeof code === 'string' ? code.trim() || null : null
  if (description !== undefined) {
    updates.description = typeof description === 'string' ? description.trim() || null : null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Capture the old name/code so we can migrate project_details if the bid
  // sheet has already been converted (rename/code edits would otherwise leave
  // the converted PO pointing at the old system).
  const { data: before } = await supabase
    .from('bid_sheet_systems')
    .select('name, code')
    .eq('id', system_id)
    .eq('bid_sheet_id', id)
    .maybeSingle()

  const { data, error } = await supabase
    .from('bid_sheet_systems')
    .update(updates)
    .eq('id', system_id)
    .eq('bid_sheet_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    const { data: sheet } = await supabase
      .from('bid_sheets')
      .select('status, converted_po_id, site_id')
      .eq('id', id)
      .single()
    if (sheet?.status === 'converted' && sheet.converted_po_id && sheet.site_id) {
      try {
        const admin = createAdminClient()
        await renameSystemForProject(
          admin,
          sheet.site_id,
          sheet.converted_po_id,
          before.name,
          before.code ?? null,
          data.name,
          data.code ?? null
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to sync system rename to project budget'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

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

  const systemId = new URL(req.url).searchParams.get('system_id')
  if (!systemId) return NextResponse.json({ error: 'system_id is required' }, { status: 400 })

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
    .eq('bid_sheet_system_id', systemId)

  try {
    if (sheet?.status === 'converted' && sheet.converted_po_id && sheet.site_id && rows?.length) {
      for (const r of rows) {
        await deleteBidSheetItemFromProject(admin, sheet.site_id, sheet.converted_po_id, r as BidSheetItemRow)
      }
    }
    await admin.from('bid_sheet_items').delete().eq('bid_sheet_id', bidSheetId).eq('bid_sheet_system_id', systemId)
    const { error } = await admin.from('bid_sheet_systems').delete().eq('id', systemId).eq('bid_sheet_id', bidSheetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete system'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
