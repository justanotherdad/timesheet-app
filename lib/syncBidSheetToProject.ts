import type { SupabaseClient } from '@supabase/supabase-js'

export type BidSheetItemRow = {
  budgeted_hours: number | null
  bid_sheet_systems: { name: string; code?: string | null } | null
  bid_sheet_deliverables: { name: string } | null
  bid_sheet_activities: { name: string } | null
}

async function findOrCreateSystem(admin: SupabaseClient, siteId: string, name: string, code: string | null): Promise<string> {
  let q = admin.from('systems').select('id').eq('site_id', siteId).eq('name', name)
  if (code) q = q.eq('code', code)
  else q = q.is('code', null)
  const { data: existing } = await q.limit(1).maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin.from('systems').insert({ site_id: siteId, name, code }).select('id').single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create system')
  return ins.id
}

async function findOrCreateDeliverable(admin: SupabaseClient, siteId: string, name: string): Promise<string> {
  const { data: existing } = await admin.from('deliverables').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin.from('deliverables').insert({ site_id: siteId, name }).select('id').single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create deliverable')
  return ins.id
}

async function findOrCreateActivity(admin: SupabaseClient, siteId: string, name: string): Promise<string> {
  const { data: existing } = await admin.from('activities').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin.from('activities').insert({ site_id: siteId, name }).select('id').single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create activity')
  return ins.id
}

async function ensurePoLink(
  admin: SupabaseClient,
  table: 'system_purchase_orders' | 'deliverable_purchase_orders' | 'activity_purchase_orders',
  fkCol: 'system_id' | 'deliverable_id' | 'activity_id',
  entityId: string,
  poId: string
) {
  const { data: existing } = await admin.from(table).select(fkCol).eq(fkCol, entityId).eq('purchase_order_id', poId).maybeSingle()
  if (existing) return
  await admin.from(table).insert({ [fkCol]: entityId, purchase_order_id: poId } as Record<string, string>)
}

/**
 * After a bid sheet is converted, keep site-level systems/deliverables/activities and project_details
 * in sync when bid_sheet_items change.
 */
export async function syncBidSheetItemToProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  item: BidSheetItemRow
): Promise<void> {
  const sys = item.bid_sheet_systems
  const del = item.bid_sheet_deliverables
  const act = item.bid_sheet_activities
  if (!sys?.name || !del?.name || !act?.name) return

  const systemId = await findOrCreateSystem(admin, siteId, sys.name, sys.code || null)
  const deliverableId = await findOrCreateDeliverable(admin, siteId, del.name)
  const activityId = await findOrCreateActivity(admin, siteId, act.name)

  await ensurePoLink(admin, 'system_purchase_orders', 'system_id', systemId, poId)
  await ensurePoLink(admin, 'deliverable_purchase_orders', 'deliverable_id', deliverableId, poId)
  await ensurePoLink(admin, 'activity_purchase_orders', 'activity_id', activityId, poId)

  const hours = Number(item.budgeted_hours) || 0

  const { data: existing } = await admin
    .from('project_details')
    .select('id')
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin.from('project_details').update({ budgeted_hours: hours }).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('project_details').insert({
      po_id: poId,
      system_id: systemId,
      deliverable_id: deliverableId,
      activity_id: activityId,
      budgeted_hours: hours,
    })
    if (error) throw new Error(error.message)
  }
}

async function findSystemId(admin: SupabaseClient, siteId: string, name: string, code: string | null): Promise<string | null> {
  let q = admin.from('systems').select('id').eq('site_id', siteId).eq('name', name)
  if (code) q = q.eq('code', code)
  else q = q.is('code', null)
  const { data } = await q.limit(1).maybeSingle()
  return data?.id ?? null
}

async function findDeliverableId(admin: SupabaseClient, siteId: string, name: string): Promise<string | null> {
  const { data } = await admin.from('deliverables').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
  return data?.id ?? null
}

async function findActivityId(admin: SupabaseClient, siteId: string, name: string): Promise<string | null> {
  const { data } = await admin.from('activities').select('id').eq('site_id', siteId).eq('name', name).limit(1).maybeSingle()
  return data?.id ?? null
}

/** Remove project_details row when a bid sheet cell is deleted (resolved by name, same as convert). */
export async function deleteBidSheetItemFromProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  item: BidSheetItemRow
): Promise<void> {
  const sys = item.bid_sheet_systems
  const del = item.bid_sheet_deliverables
  const act = item.bid_sheet_activities
  if (!sys?.name || !del?.name || !act?.name) return

  const systemId = await findSystemId(admin, siteId, sys.name, sys.code || null)
  const deliverableId = await findDeliverableId(admin, siteId, del.name)
  const activityId = await findActivityId(admin, siteId, act.name)
  if (!systemId || !deliverableId || !activityId) return

  await admin
    .from('project_details')
    .delete()
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
}
