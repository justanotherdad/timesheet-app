import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
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

  const { data: sheet } = await supabase.from('bid_sheets').select('*, sites(id, name)').eq('id', id).single()
  if (!sheet) return NextResponse.json({ error: 'Bid sheet not found' }, { status: 404 })
  if (sheet.status === 'converted') return NextResponse.json({ error: 'Bid sheet already converted' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) || {}
  const { department_id, po_number, project_name } = body

  const adminSupabase = createAdminClient()

  const { data: po, error: poErr } = await adminSupabase
    .from('purchase_orders')
    .insert({
      site_id: sheet.site_id,
      department_id: department_id || null,
      po_number: po_number || `BS-${sheet.name?.slice(0, 20) || id.slice(0, 8)}`,
      description: project_name || sheet.name,
      project_name: project_name || sheet.name,
      budget_type: 'project',
      original_po_amount: null,
    })
    .select()
    .single()

  if (poErr || !po) return NextResponse.json({ error: poErr?.message || 'Failed to create PO' }, { status: 500 })

  const { data: items } = await adminSupabase
    .from('bid_sheet_items')
    .select('*, bid_sheet_systems(id, name, code), bid_sheet_deliverables(id, name), bid_sheet_activities(id, name)')
    .eq('bid_sheet_id', id)

  if ((items || []).length > 0) {
    const siteId = sheet.site_id

    const findOrCreateSystem = async (name: string, code: string | null): Promise<string> => {
      let q = adminSupabase.from('systems').select('id').eq('site_id', siteId).eq('name', name)
      if (code) q = q.eq('code', code)
      else q = q.is('code', null)
      const { data: existing } = await q.limit(1).maybeSingle()
      if (existing?.id) return existing.id
      const { data: ins, error } = await adminSupabase.from('systems').insert({ site_id: siteId, name, code }).select('id').single()
      if (error || !ins?.id) throw new Error('Failed to create system')
      return ins.id
    }
    const findOrCreateDeliverable = async (name: string): Promise<string> => {
      const { data: existing } = await adminSupabase.from('deliverables').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
      if (existing?.id) return existing.id
      const { data: ins, error } = await adminSupabase.from('deliverables').insert({ site_id: siteId, name }).select('id').single()
      if (error || !ins?.id) throw new Error('Failed to create deliverable')
      return ins.id
    }
    const findOrCreateActivity = async (name: string): Promise<string> => {
      const { data: existing } = await adminSupabase.from('activities').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
      if (existing?.id) return existing.id
      const { data: ins, error } = await adminSupabase.from('activities').insert({ site_id: siteId, name }).select('id').single()
      if (error || !ins?.id) throw new Error('Failed to create activity')
      return ins.id
    }

    const sysMap = new Map<string, string>()
    const delMap = new Map<string, string>()
    const actMap = new Map<string, string>()

    for (const r of items || []) {
      const sys = r.bid_sheet_systems as { name: string; code?: string } | null
      const del = r.bid_sheet_deliverables as { name: string } | null
      const act = r.bid_sheet_activities as { name: string } | null
      if (!sys?.name || !del?.name || !act?.name) continue

      const sysKey = `${sys.name}|${sys.code ?? ''}`
      const delKey = del.name
      const actKey = act.name

      if (!sysMap.has(sysKey)) {
        sysMap.set(sysKey, await findOrCreateSystem(sys.name, sys.code || null))
      }
      if (!delMap.has(delKey)) {
        delMap.set(delKey, await findOrCreateDeliverable(del.name))
      }
      if (!actMap.has(actKey)) {
        actMap.set(actKey, await findOrCreateActivity(act.name))
      }
    }

    const sysIds = [...new Set(sysMap.values())]
    const delIds = [...new Set(delMap.values())]
    const actIds = [...new Set(actMap.values())]

    if (sysIds.length > 0) {
      await adminSupabase.from('system_purchase_orders').insert(sysIds.map((system_id) => ({ system_id, purchase_order_id: po.id })))
    }
    if (delIds.length > 0) {
      await adminSupabase.from('deliverable_purchase_orders').insert(delIds.map((deliverable_id) => ({ deliverable_id, purchase_order_id: po.id })))
    }
    if (actIds.length > 0) {
      await adminSupabase.from('activity_purchase_orders').insert(actIds.map((activity_id) => ({ activity_id, purchase_order_id: po.id })))
    }

    const projectDetailsRows = (items || [])
      .map((r: any) => {
        const sys = r.bid_sheet_systems as { name: string; code?: string } | null
        const del = r.bid_sheet_deliverables as { name: string } | null
        const act = r.bid_sheet_activities as { name: string } | null
        if (!sys?.name || !del?.name || !act?.name) return null
        const systemId = sysMap.get(`${sys.name}|${sys.code ?? ''}`)
        const deliverableId = delMap.get(del.name)
        const activityId = actMap.get(act.name)
        if (!systemId || !deliverableId || !activityId) return null
        return { po_id: po.id, system_id: systemId, deliverable_id: deliverableId, activity_id: activityId, budgeted_hours: r.budgeted_hours ?? 0 }
      })
      .filter(Boolean)

    if (projectDetailsRows.length > 0) {
      await adminSupabase.from('project_details').insert(projectDetailsRows)
    }
  }

  const { data: labor } = await adminSupabase.from('bid_sheet_labor').select('*').eq('bid_sheet_id', id)
  if ((labor || []).length > 0) {
    for (const l of labor || []) {
      if (l.user_id) {
        await adminSupabase.from('po_bill_rates').insert({
          po_id: po.id,
          user_id: l.user_id,
          rate: l.bid_rate,
          effective_from_date: new Date().toISOString().slice(0, 10),
        })
      }
    }
  }

  await adminSupabase.from('bid_sheets').update({ status: 'converted', converted_po_id: po.id }).eq('id', id)

  logAudit({
    actorId: user.id,
    actorName: user.profile?.name,
    action: 'bid_sheet.convert',
    entityType: 'bid_sheet',
    entityId: id,
    newValues: { bid_sheet_id: id, po_id: po.id, po_number: po.po_number },
  })

  return NextResponse.json({ po_id: po.id, po_number: po.po_number })
}
