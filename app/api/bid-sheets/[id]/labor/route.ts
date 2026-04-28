import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { ensureLaborBillRate } from '@/lib/syncBidSheetToProject'

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
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const body = await req.json()
  const { user_id, placeholder_name, bid_rate, notes } = body
  const hasUser = user_id && String(user_id).trim()
  const hasPlaceholder = placeholder_name && String(placeholder_name).trim()
  if ((!hasUser && !hasPlaceholder) || bid_rate == null) {
    return NextResponse.json({ error: 'Provide user_id or placeholder_name, and bid_rate' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bid_sheet_labor')
    .insert({
      bid_sheet_id: id,
      user_id: hasUser ? user_id : null,
      placeholder_name: hasPlaceholder ? String(placeholder_name).trim() : null,
      bid_rate: parseFloat(String(bid_rate)) || 0,
      notes: notes || null,
    })
    .select('*, user_profiles(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.user_id) {
    const { data: sheet } = await supabase.from('bid_sheets').select('status, converted_po_id').eq('id', id).single()
    if (sheet?.status === 'converted' && sheet.converted_po_id) {
      try {
        const admin = createAdminClient()
        await ensureLaborBillRate(
          admin,
          sheet.converted_po_id,
          data.user_id,
          Number(data.bid_rate) || 0,
          new Date().toISOString().slice(0, 10)
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to sync labor rate to project'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const body = await req.json()
  const { labor_id, user_id, placeholder_name, bid_rate, notes } = body
  if (!labor_id) return NextResponse.json({ error: 'labor_id required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (user_id !== undefined) updates.user_id = user_id || null
  if (placeholder_name !== undefined) updates.placeholder_name = placeholder_name ? String(placeholder_name).trim() : null
  if (bid_rate !== undefined) updates.bid_rate = parseFloat(String(bid_rate)) || 0
  if (notes !== undefined) updates.notes = notes || null

  const { data, error } = await supabase
    .from('bid_sheet_labor')
    .update(updates)
    .eq('id', labor_id)
    .eq('bid_sheet_id', id)
    .select('*, user_profiles(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.user_id) {
    const { data: sheet } = await supabase.from('bid_sheets').select('status, converted_po_id').eq('id', id).single()
    if (sheet?.status === 'converted' && sheet.converted_po_id) {
      try {
        const admin = createAdminClient()
        await ensureLaborBillRate(
          admin,
          sheet.converted_po_id,
          data.user_id,
          Number(data.bid_rate) || 0,
          new Date().toISOString().slice(0, 10)
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to sync labor rate to project'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const laborId = searchParams.get('labor_id')
  if (!laborId) return NextResponse.json({ error: 'labor_id required' }, { status: 400 })

  const { error } = await supabase.from('bid_sheet_labor').delete().eq('id', laborId).eq('bid_sheet_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
