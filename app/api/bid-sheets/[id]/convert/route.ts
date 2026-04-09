import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { decodeIndirectNotes, indirectLineDollarTotal } from '@/lib/bid-sheet-indirect'

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

const PRESET_INDIRECT_LABEL: Record<string, string> = {
  project_management: 'Indirect — Project Management',
  document_coordinator: 'Indirect — Document Coordinator',
  project_controls: 'Indirect — Project Controls',
  travel_living_project: 'Indirect — Travel & Living (Project by Person)',
  travel_living_fat: 'Indirect — Travel & Living (FAT)',
  additional_indirect: 'Indirect — Additional Indirect Costs',
}

function indirectExpenseTitle(category: string, notes: string | null | undefined): string {
  if (category.startsWith('custom_')) {
    const meta = decodeIndirectNotes(notes)
    const name = meta.label?.trim()
    return name ? `Indirect — ${name}` : 'Indirect — Additional line'
  }
  return PRESET_INDIRECT_LABEL[category] || `Indirect — ${category}`
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

  const { data: items } = await adminSupabase
    .from('bid_sheet_items')
    .select('*, bid_sheet_systems(id, name, code), bid_sheet_deliverables(id, name), bid_sheet_activities(id, name)')
    .eq('bid_sheet_id', id)

  const { data: laborRows } = await adminSupabase.from('bid_sheet_labor').select('*').eq('bid_sheet_id', id)
  const laborById = new Map((laborRows || []).map((l: { id: string }) => [l.id, l]))

  for (const it of items || []) {
    const row = it as { budgeted_hours?: number | null; labor_id?: string | null }
    const hrs = Number(row.budgeted_hours) || 0
    if (hrs <= 0) continue
    if (!row.labor_id) {
      return NextResponse.json(
        {
          error:
            'Every matrix cell with hours must have a resource or placeholder. Add people under Labor & Rates, then assign one per cell before converting.',
        },
        { status: 400 }
      )
    }
    const lab = laborById.get(row.labor_id) as { user_id?: string | null; placeholder_name?: string | null; bid_rate?: number | null } | undefined
    if (!lab) {
      return NextResponse.json({ error: 'Matrix references a missing labor row. Refresh the bid sheet and try again.' }, { status: 400 })
    }
    const hasPerson = (lab.user_id != null && String(lab.user_id).trim() !== '') || (lab.placeholder_name != null && String(lab.placeholder_name).trim() !== '')
    if (!hasPerson) {
      return NextResponse.json(
        { error: 'Each labor row must be an existing user or a placeholder name before converting.' },
        { status: 400 }
      )
    }
  }

  let matrixLaborCost = 0
  for (const it of items || []) {
    const row = it as { budgeted_hours?: number | null; labor_id?: string | null }
    const hrs = Number(row.budgeted_hours) || 0
    if (hrs <= 0) continue
    const lab = laborById.get(row.labor_id!) as { bid_rate?: number | null }
    matrixLaborCost += hrs * (Number(lab?.bid_rate) || 0)
  }

  const { data: indirectRows } = await adminSupabase.from('bid_sheet_indirect_labor').select('*').eq('bid_sheet_id', id)

  let indirectTotal = 0
  for (const row of indirectRows || []) {
    indirectTotal += indirectLineDollarTotal(Number(row.hours) || 0, Number(row.rate) || 0, row.category, row.notes)
  }

  const grandTotal = matrixLaborCost + indirectTotal
  const today = new Date().toISOString().slice(0, 10)

  const { data: po, error: poErr } = await adminSupabase
    .from('purchase_orders')
    .insert({
      site_id: sheet.site_id,
      department_id: department_id || null,
      po_number: po_number || `BS-${sheet.name?.slice(0, 20) || id.slice(0, 8)}`,
      description: project_name || sheet.name,
      project_name: project_name || sheet.name,
      budget_type: 'project',
      original_po_amount: grandTotal,
      po_balance: grandTotal,
    })
    .select()
    .single()

  if (poErr || !po) return NextResponse.json({ error: poErr?.message || 'Failed to create PO' }, { status: 500 })

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

  if ((laborRows || []).length > 0) {
    for (const l of laborRows || []) {
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

  for (const row of indirectRows || []) {
    const amt = indirectLineDollarTotal(Number(row.hours) || 0, Number(row.rate) || 0, row.category, row.notes)
    if (amt <= 0) continue
    const title = indirectExpenseTitle(row.category, row.notes)
    const { error: expErr } = await adminSupabase.from('po_expenses').insert({
      po_id: po.id,
      amount: amt,
      expense_date: today,
      custom_type_name: title,
      notes: `Imported from bid sheet indirect (${row.category})`,
      created_by: user.id,
    })
    if (expErr) {
      console.error('convert: po_expenses insert failed', expErr)
      return NextResponse.json({ error: expErr.message || 'Failed to copy indirect costs to the project budget' }, { status: 500 })
    }
  }

  const { error: accessErr } = await adminSupabase.from('po_budget_access').insert({
    user_id: user.id,
    purchase_order_id: po.id,
  })
  if (accessErr && accessErr.code !== '23505') {
    console.error('convert: po_budget_access insert failed', accessErr)
  }

  const { error: upoErr } = await adminSupabase.from('user_purchase_orders').insert({
    user_id: user.id,
    purchase_order_id: po.id,
  })
  if (upoErr && upoErr.code !== '23505') {
    console.warn('convert: user_purchase_orders insert skipped', upoErr.message)
  }

  await adminSupabase.from('bid_sheets').update({ status: 'converted', converted_po_id: po.id }).eq('id', id)

  return NextResponse.json({ po_id: po.id, po_number: po.po_number })
}
