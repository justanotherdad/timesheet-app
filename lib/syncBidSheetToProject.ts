import type { SupabaseClient } from '@supabase/supabase-js'
import {
  INDIRECT_DELIVERABLE_NAME,
  INDIRECT_SYSTEM_NAME,
  indirectActivityName,
} from '@/lib/bid-sheet-indirect'

export type BidSheetItemRow = {
  budgeted_hours: number | null
  bid_sheet_systems: { name: string; code?: string | null } | null
  bid_sheet_deliverables: { name: string } | null
  bid_sheet_activities: { name: string } | null
}

// All sync helpers below are scoped by `project_po_id = poId`. A bid-sheet
// conversion (and any subsequent edits to that bid sheet) only ever
// looks up or creates rows that belong to its own project PO, so a
// project never reuses a global "Travel" activity or pollutes the global
// Manage Timesheet Options listing. Globals (project_po_id IS NULL) are
// untouched by these helpers.

async function findOrCreateSystem(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string,
  code: string | null
): Promise<string> {
  let q = admin
    .from('systems')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
  if (code) q = q.eq('code', code)
  else q = q.is('code', null)
  const { data: existing } = await q.limit(1).maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin
    .from('systems')
    .insert({ site_id: siteId, name, code, project_po_id: poId })
    .select('id')
    .single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create system')
  return ins.id
}

async function findOrCreateDeliverable(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string
): Promise<string> {
  const { data: existing } = await admin
    .from('deliverables')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin
    .from('deliverables')
    .insert({ site_id: siteId, name, project_po_id: poId })
    .select('id')
    .single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create deliverable')
  return ins.id
}

async function findOrCreateActivity(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string
): Promise<string> {
  const { data: existing } = await admin
    .from('activities')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id
  const { data: ins, error } = await admin
    .from('activities')
    .insert({ site_id: siteId, name, project_po_id: poId })
    .select('id')
    .single()
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

  const systemId = await findOrCreateSystem(admin, siteId, poId, sys.name, sys.code || null)
  const deliverableId = await findOrCreateDeliverable(admin, siteId, poId, del.name)
  const activityId = await findOrCreateActivity(admin, siteId, poId, act.name)

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
      description: null,
    })
    if (error) throw new Error(error.message)
  }
}

/**
 * Create or update a project_details row from display names (e.g. Budget matrix "Add row" form).
 */
export async function upsertProjectDetailByNames(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  input: {
    systemName: string
    systemCode: string | null
    deliverableName: string
    activityName: string
    budgetedHours: number
    description?: string | null
  }
): Promise<{ id: string }> {
  const sn = input.systemName.trim()
  const dn = input.deliverableName.trim()
  const an = input.activityName.trim()
  if (!sn || !dn || !an) throw new Error('System, deliverable, and activity names are required')

  const systemId = await findOrCreateSystem(admin, siteId, poId, sn, input.systemCode)
  const deliverableId = await findOrCreateDeliverable(admin, siteId, poId, dn)
  const activityId = await findOrCreateActivity(admin, siteId, poId, an)

  await ensurePoLink(admin, 'system_purchase_orders', 'system_id', systemId, poId)
  await ensurePoLink(admin, 'deliverable_purchase_orders', 'deliverable_id', deliverableId, poId)
  await ensurePoLink(admin, 'activity_purchase_orders', 'activity_id', activityId, poId)

  const hours = Number(input.budgetedHours) || 0
  let desc: string | null | undefined
  if (input.description === undefined) desc = undefined
  else if (input.description === null) desc = null
  else desc = String(input.description).trim() || null

  const { data: existing } = await admin
    .from('project_details')
    .select('id')
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
    .maybeSingle()

  if (existing?.id) {
    const upd: Record<string, unknown> = { budgeted_hours: hours }
    if (desc !== undefined) upd.description = desc
    const { error } = await admin.from('project_details').update(upd).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return { id: existing.id }
  }

  const { data: ins, error } = await admin
    .from('project_details')
    .insert({
      po_id: poId,
      system_id: systemId,
      deliverable_id: deliverableId,
      activity_id: activityId,
      budgeted_hours: hours,
      description: desc !== undefined ? desc : null,
    })
    .select('id')
    .single()
  if (error || !ins?.id) throw new Error(error?.message || 'Failed to create project detail')
  return { id: ins.id }
}

async function findSystemId(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string,
  code: string | null
): Promise<string | null> {
  let q = admin
    .from('systems')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
  if (code) q = q.eq('code', code)
  else q = q.is('code', null)
  const { data } = await q.limit(1).maybeSingle()
  return data?.id ?? null
}

async function findDeliverableId(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string
): Promise<string | null> {
  const { data } = await admin
    .from('deliverables')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function findActivityId(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  name: string
): Promise<string | null> {
  const { data } = await admin
    .from('activities')
    .select('id')
    .eq('site_id', siteId)
    .eq('project_po_id', poId)
    .eq('name', name)
    .limit(1)
    .maybeSingle()
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

  const systemId = await findSystemId(admin, siteId, poId, sys.name, sys.code || null)
  const deliverableId = await findDeliverableId(admin, siteId, poId, del.name)
  const activityId = await findActivityId(admin, siteId, poId, act.name)
  if (!systemId || !deliverableId || !activityId) return

  await admin
    .from('project_details')
    .delete()
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
}

/**
 * Migrate project_details rows for a converted bid sheet's PO when a bid sheet
 * system is renamed (or its code changed). Finds the original `systems` row by
 * the prior name/code, looks up or creates a new `systems` row matching the
 * updated name/code at the same site, and re-points project_details + the
 * `system_purchase_orders` junction to the new system. The old system row is
 * left alone (it may still be in use elsewhere).
 */
export async function renameSystemForProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  oldName: string,
  oldCode: string | null,
  newName: string,
  newCode: string | null
): Promise<void> {
  if (oldName === newName && (oldCode || null) === (newCode || null)) return

  const oldSystemId = await findSystemId(admin, siteId, poId, oldName, oldCode)
  if (!oldSystemId) return

  // Project-scoped rows are owned by this PO, so we can rename in place
  // instead of re-pointing project_details to a different row. This keeps
  // the row count tidy and avoids leaving stale "old name" rows behind.
  const updatePayload: Record<string, string | null> = { name: newName, code: newCode }
  const { error: renameErr } = await admin
    .from('systems')
    .update(updatePayload)
    .eq('id', oldSystemId)
  if (renameErr) throw new Error(renameErr.message)

  await ensurePoLink(admin, 'system_purchase_orders', 'system_id', oldSystemId, poId)
}

/** Same as renameSystemForProject but for deliverables (no code column). */
export async function renameDeliverableForProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  oldName: string,
  newName: string
): Promise<void> {
  if (oldName === newName) return

  const oldId = await findDeliverableId(admin, siteId, poId, oldName)
  if (!oldId) return

  const { error: renameErr } = await admin
    .from('deliverables')
    .update({ name: newName })
    .eq('id', oldId)
  if (renameErr) throw new Error(renameErr.message)

  await ensurePoLink(admin, 'deliverable_purchase_orders', 'deliverable_id', oldId, poId)
}

/** Same as renameSystemForProject but for activities. */
export async function renameActivityForProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  oldName: string,
  newName: string
): Promise<void> {
  if (oldName === newName) return

  const oldId = await findActivityId(admin, siteId, poId, oldName)
  if (!oldId) return

  const { error: renameErr } = await admin
    .from('activities')
    .update({ name: newName })
    .eq('id', oldId)
  if (renameErr) throw new Error(renameErr.message)

  await ensurePoLink(admin, 'activity_purchase_orders', 'activity_id', oldId, poId)
}

/**
 * Stable marker stored inside `po_expenses.notes` so we can find the row
 * later when a bid sheet's indirect-labor row is edited or deleted. The
 * marker survives user edits as long as they leave it intact; edits that
 * remove it will simply orphan the link (manual cleanup needed).
 */
export function indirectExpenseMarker(category: string): string {
  return `[bs-indirect:${category}]`
}

export function composeIndirectExpenseNotes(category: string): string {
  return `${indirectExpenseMarker(category)} Imported from bid sheet indirect (${category})`
}

/** Insert or update the po_expense row that mirrors a bid sheet indirect-labor line. */
export async function upsertIndirectExpenseForProject(
  admin: SupabaseClient,
  poId: string,
  category: string,
  amount: number,
  title: string,
  expenseDate: string,
  createdBy: string
): Promise<void> {
  const marker = indirectExpenseMarker(category)
  const { data: existing } = await admin
    .from('po_expenses')
    .select('id')
    .eq('po_id', poId)
    .like('notes', `%${marker}%`)
    .limit(1)
    .maybeSingle()

  const payload = {
    po_id: poId,
    amount,
    expense_date: expenseDate,
    custom_type_name: title,
    notes: composeIndirectExpenseNotes(category),
  }

  if (existing?.id) {
    const { error } = await admin.from('po_expenses').update(payload).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await admin
    .from('po_expenses')
    .insert({ ...payload, created_by: createdBy })
  if (error) throw new Error(error.message)
}

/** Delete the linked po_expense row for a bid sheet indirect-labor category, if present. */
export async function deleteIndirectExpenseForProject(
  admin: SupabaseClient,
  poId: string,
  category: string
): Promise<void> {
  const marker = indirectExpenseMarker(category)
  await admin
    .from('po_expenses')
    .delete()
    .eq('po_id', poId)
    .like('notes', `%${marker}%`)
}

/**
 * Create / update a project_details row that represents a bid-sheet indirect
 * line as a loggable activity (Indirect / Indirect / <category>). PM, Doc
 * Coord, Proj Controls, and any user-flagged Additional/Custom rows go through
 * here on convert and on subsequent edits to the bid sheet's indirect-labor
 * section, so people can log time against them in the timesheet form.
 */
export async function upsertIndirectActivityForProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  category: string,
  hours: number,
  notes: string | null | undefined
): Promise<void> {
  const activityName = indirectActivityName(category, notes)

  const systemId = await findOrCreateSystem(admin, siteId, poId, INDIRECT_SYSTEM_NAME, null)
  const deliverableId = await findOrCreateDeliverable(admin, siteId, poId, INDIRECT_DELIVERABLE_NAME)
  const activityId = await findOrCreateActivity(admin, siteId, poId, activityName)

  await ensurePoLink(admin, 'system_purchase_orders', 'system_id', systemId, poId)
  await ensurePoLink(admin, 'deliverable_purchase_orders', 'deliverable_id', deliverableId, poId)
  await ensurePoLink(admin, 'activity_purchase_orders', 'activity_id', activityId, poId)

  const { data: existing } = await admin
    .from('project_details')
    .select('id')
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin
      .from('project_details')
      .update({ budgeted_hours: hours })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await admin.from('project_details').insert({
    po_id: poId,
    system_id: systemId,
    deliverable_id: deliverableId,
    activity_id: activityId,
    budgeted_hours: hours,
    description: null,
  })
  if (error) throw new Error(error.message)
}

/**
 * Inverse of `upsertIndirectActivityForProject` — drop the project_details
 * row written for a converted indirect category. Catalog system/deliverable/
 * activity rows are left in place because they may still be referenced by
 * other bid sheets / POs on the same site.
 */
export async function deleteIndirectActivityForProject(
  admin: SupabaseClient,
  siteId: string,
  poId: string,
  category: string,
  notes: string | null | undefined
): Promise<void> {
  const activityName = indirectActivityName(category, notes)

  const systemId = await findSystemId(admin, siteId, poId, INDIRECT_SYSTEM_NAME, null)
  const deliverableId = await findDeliverableId(admin, siteId, poId, INDIRECT_DELIVERABLE_NAME)
  const activityId = await findActivityId(admin, siteId, poId, activityName)
  if (!systemId || !deliverableId || !activityId) return

  await admin
    .from('project_details')
    .delete()
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
}

/**
 * Make sure `po_bill_rates` has an entry for `userId` on this PO. Mirrors the
 * convert flow: only insert when no row exists yet so we don't overwrite the
 * rate history a manager may have curated on the project budget.
 */
export async function ensureLaborBillRate(
  admin: SupabaseClient,
  poId: string,
  userId: string,
  rate: number,
  effectiveDate: string
): Promise<void> {
  const { data: existing } = await admin
    .from('po_bill_rates')
    .select('id')
    .eq('po_id', poId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (existing) return
  await admin.from('po_bill_rates').insert({
    po_id: poId,
    user_id: userId,
    rate,
    effective_from_date: effectiveDate,
  })
}
