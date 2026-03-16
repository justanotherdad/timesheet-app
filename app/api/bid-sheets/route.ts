import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { getAccessibleBidSheetIds } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const role = user.profile.role as 'supervisor' | 'manager' | 'admin' | 'super_admin'
  const accessibleIds = await getAccessibleBidSheetIds(supabase, user.id, role)

  const db = role === 'admin' || role === 'super_admin' ? createAdminClient() : supabase
  let query = db
    .from('bid_sheets')
    .select('*, sites(id, name)')
    .order('created_at', { ascending: false })

  if (accessibleIds !== null && accessibleIds.length > 0) {
    query = query.in('id', accessibleIds)
  } else if (accessibleIds !== null && accessibleIds.length === 0) {
    return NextResponse.json([])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { site_id, name, description, clone_from_id } = body

  if (!site_id || !name) {
    return NextResponse.json({ error: 'site_id and name are required' }, { status: 400 })
  }

  // Use admin client to bypass RLS (avoids "infinite recursion" in bid_sheets policy)
  const db = createAdminClient()
  const { data: sheet, error: insertErr } = await db
    .from('bid_sheets')
    .insert({
      site_id,
      name,
      description: description || null,
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  if (!sheet) return NextResponse.json({ error: 'Failed to create bid sheet' }, { status: 500 })

  if (clone_from_id) {
    const { data: srcSystems } = await db.from('bid_sheet_systems').select('*').eq('bid_sheet_id', clone_from_id)
    const { data: srcDeliverables } = await db.from('bid_sheet_deliverables').select('*').eq('bid_sheet_id', clone_from_id)
    const { data: srcActivities } = await db.from('bid_sheet_activities').select('*').eq('bid_sheet_id', clone_from_id)
    const { data: srcItems } = await db.from('bid_sheet_items').select('*').eq('bid_sheet_id', clone_from_id)
    const { data: srcLabor } = await db.from('bid_sheet_labor').select('*').eq('bid_sheet_id', clone_from_id)
    const { data: srcIndirect } = await db.from('bid_sheet_indirect_labor').select('*').eq('bid_sheet_id', clone_from_id)

    const sysMap = new Map<string, string>()
    const delMap = new Map<string, string>()
    const actMap = new Map<string, string>()

    if ((srcSystems || []).length > 0) {
      for (const s of srcSystems || []) {
        const { data: ins } = await db.from('bid_sheet_systems').insert({ bid_sheet_id: sheet.id, name: s.name, code: s.code }).select('id').single()
        if (ins?.id) sysMap.set(s.id, ins.id)
      }
    }
    if ((srcDeliverables || []).length > 0) {
      for (const d of srcDeliverables || []) {
        const { data: ins } = await db.from('bid_sheet_deliverables').insert({ bid_sheet_id: sheet.id, name: d.name }).select('id').single()
        if (ins?.id) delMap.set(d.id, ins.id)
      }
    }
    if ((srcActivities || []).length > 0) {
      for (const a of srcActivities || []) {
        const { data: ins } = await db.from('bid_sheet_activities').insert({ bid_sheet_id: sheet.id, name: a.name }).select('id').single()
        if (ins?.id) actMap.set(a.id, ins.id)
      }
    }

    const laborMap = new Map<string, string>()
    if ((srcLabor || []).length > 0) {
      const { data: insertedLabor } = await db.from('bid_sheet_labor').insert(
        (srcLabor || []).map((r: any) => ({
          bid_sheet_id: sheet.id,
          user_id: r.user_id,
          placeholder_name: r.placeholder_name,
          bid_rate: r.bid_rate,
          notes: r.notes,
        }))
      ).select('id')
      if (insertedLabor && insertedLabor.length === (srcLabor || []).length) {
        ;(srcLabor || []).forEach((r: any, i: number) => {
          if (insertedLabor[i]?.id) laborMap.set(r.id, insertedLabor[i].id)
        })
      }
    }
    if ((srcItems || []).length > 0) {
      const itemsToInsert = (srcItems || [])
        .map((r: any) => {
          const sysId = sysMap.get(r.bid_sheet_system_id)
          const delId = delMap.get(r.bid_sheet_deliverable_id)
          const actId = actMap.get(r.bid_sheet_activity_id)
          if (!sysId || !delId || !actId) return null
          const newLaborId = r.labor_id ? laborMap.get(r.labor_id) : null
          return {
            bid_sheet_id: sheet.id,
            bid_sheet_system_id: sysId,
            bid_sheet_deliverable_id: delId,
            bid_sheet_activity_id: actId,
            budgeted_hours: r.budgeted_hours ?? 0,
            labor_id: newLaborId || null,
          }
        })
        .filter(Boolean)
      if (itemsToInsert.length > 0) {
        await db.from('bid_sheet_items').insert(itemsToInsert)
      }
    }
    if ((srcIndirect || []).length > 0) {
      await db.from('bid_sheet_indirect_labor').insert(
        (srcIndirect || []).map((r: any) => ({
          bid_sheet_id: sheet.id,
          category: r.category,
          hours: r.hours,
          rate: r.rate,
          notes: r.notes,
        }))
      )
    }
  }

  return NextResponse.json(sheet)
}
