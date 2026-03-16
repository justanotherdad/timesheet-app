import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

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
  const { bid_sheet_system_id, bid_sheet_deliverable_id, bid_sheet_activity_id, budgeted_hours, labor_id } = body
  if (!bid_sheet_system_id || !bid_sheet_deliverable_id || !bid_sheet_activity_id) {
    return NextResponse.json({ error: 'bid_sheet_system_id, bid_sheet_deliverable_id, bid_sheet_activity_id required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    bid_sheet_id: id,
    bid_sheet_system_id,
    bid_sheet_deliverable_id,
    bid_sheet_activity_id,
    budgeted_hours: Number(budgeted_hours) || 0,
  }
  if (labor_id !== undefined && labor_id !== null && labor_id !== '') {
    payload.labor_id = labor_id
  } else {
    payload.labor_id = null
  }

  const { data, error } = await supabase
    .from('bid_sheet_items')
    .upsert(
      payload,
      { onConflict: 'bid_sheet_id,bid_sheet_system_id,bid_sheet_deliverable_id,bid_sheet_activity_id' }
    )
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
  const { item_id, budgeted_hours } = body
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('bid_sheet_items')
    .update({ budgeted_hours: Number(budgeted_hours) ?? 0 })
    .eq('id', item_id)
    .eq('bid_sheet_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('item_id')
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const { error } = await supabase.from('bid_sheet_items').delete().eq('id', itemId).eq('bid_sheet_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
