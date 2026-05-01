import type { SupabaseClient } from '@supabase/supabase-js'
import { withQueryTimeout } from '@/lib/timeout'
import { billRateIsActiveOnDate } from '@/lib/po-bill-rate-utils'

/** Distinct PO ids where this user has an active bill rate (not ended before today). */
export async function getBillRatePoIdsForUser(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('po_bill_rates')
    .select('po_id,effective_from_date,effective_to_date')
    .eq('user_id', userId)
  if (error || !data) return []
  const today = new Date().toISOString().slice(0, 10)
  const ids = new Set<string>()
  for (const r of data as { po_id: string; effective_from_date?: string | null; effective_to_date?: string | null }[]) {
    if (r.po_id && billRateIsActiveOnDate(r, today)) ids.add(r.po_id)
  }
  return [...ids]
}

export type BillRatePoSummaryRow = {
  po_id: string
  site_name: string
  site_id: string
  po_number: string
  project_description: string
}

/** One row per PO (deduped), sorted by site name then PO number. */
export async function getBillRatePoSummaryForUser(
  admin: SupabaseClient,
  userId: string
): Promise<BillRatePoSummaryRow[]> {
  const poIds = await getBillRatePoIdsForUser(admin, userId)
  if (poIds.length === 0) return []

  const { data: pos, error } = await admin
    .from('purchase_orders')
    .select('id, site_id, po_number, description, project_name')
    .in('id', poIds)
  if (error || !pos?.length) return []

  const siteIds = [...new Set(pos.map((p: { site_id: string }) => p.site_id).filter(Boolean))]
  const { data: siteRows } =
    siteIds.length > 0
      ? await admin.from('sites').select('id, name').in('id', siteIds)
      : { data: [] }
  const siteNameById = Object.fromEntries(
    (siteRows || []).map((s: { id: string; name: string }) => [s.id, s.name || ''])
  )

  const rows: BillRatePoSummaryRow[] = pos.map((p: any) => ({
    po_id: p.id,
    site_id: p.site_id,
    site_name: siteNameById[p.site_id] || 'Unknown',
    po_number: p.po_number || '',
    project_description: (p.project_name || p.description || '').trim() || '—',
  }))

  rows.sort((a, b) => {
    const s = a.site_name.localeCompare(b.site_name, undefined, { sensitivity: 'base' })
    if (s !== 0) return s
    return a.po_number.localeCompare(b.po_number, undefined, { numeric: true })
  })

  return rows
}

/** Bill-rate PO rows per user (for admin user list). One query for all users. */
export async function getBillRatePoSummaryByUserIds(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Record<string, BillRatePoSummaryRow[]>> {
  const empty: Record<string, BillRatePoSummaryRow[]> = {}
  userIds.forEach((id) => {
    empty[id] = []
  })
  if (userIds.length === 0) return {}

  const { data: brRows } = await admin
    .from('po_bill_rates')
    .select('user_id, po_id, effective_from_date, effective_to_date')
    .in('user_id', userIds)
  if (!brRows?.length) return empty

  const today = new Date().toISOString().slice(0, 10)
  const byUser: Record<string, Set<string>> = {}
  for (const uid of userIds) byUser[uid] = new Set()
  for (const r of brRows as {
    user_id: string
    po_id: string
    effective_from_date?: string | null
    effective_to_date?: string | null
  }[]) {
    if (billRateIsActiveOnDate(r, today)) byUser[r.user_id]?.add(r.po_id)
  }

  const allPoIds = [...new Set((brRows as { po_id: string }[]).map((r) => r.po_id).filter(Boolean))]
  if (allPoIds.length === 0) return empty

  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id, site_id, po_number, description, project_name')
    .in('id', allPoIds)
  const poById = Object.fromEntries((pos || []).map((p: any) => [p.id, p]))

  const siteIds = [...new Set((pos || []).map((p: any) => p.site_id).filter(Boolean))]
  const { data: siteRows } =
    siteIds.length > 0 ? await admin.from('sites').select('id, name').in('id', siteIds) : { data: [] }
  const siteNameById = Object.fromEntries((siteRows || []).map((s: any) => [s.id, s.name || '']))

  const result: Record<string, BillRatePoSummaryRow[]> = { ...empty }
  for (const uid of userIds) {
    const poIds = [...(byUser[uid] || [])]
    const rows: BillRatePoSummaryRow[] = []
    for (const pid of poIds) {
      const p = poById[pid]
      if (!p) continue
      rows.push({
        po_id: p.id,
        site_id: p.site_id,
        site_name: siteNameById[p.site_id] || 'Unknown',
        po_number: p.po_number || '',
        project_description: (p.project_name || p.description || '').trim() || '—',
      })
    }
    rows.sort((a, b) => {
      const s = a.site_name.localeCompare(b.site_name, undefined, { sensitivity: 'base' })
      if (s !== 0) return s
      return a.po_number.localeCompare(b.po_number, undefined, { numeric: true })
    })
    result[uid] = rows
  }
  return result
}

export type ProjectDetailCombo = { systemId: string; deliverableId: string; activityId: string }

export type TimesheetDropdownPayload = {
  sites: any[]
  purchaseOrders: any[]
  systems: any[]
  deliverables: any[]
  activities: any[]
  deliverablePOIds: Record<string, string[]>
  deliverableDepartmentIds: Record<string, string[]>
  activityPOIds: Record<string, string[]>
  /**
   * Map of project-budget PO id -> list of valid (system, deliverable, activity)
   * triplets pulled from project_details. The timesheet form uses this to
   * restrict its dropdown options when the selected PO is a Project Budget,
   * preventing entries from referencing combos that don't exist as matrix cells.
   * Basic Budget POs are absent from this map and keep the looser dept/PO filter.
   */
  projectBudgetCombosByPo: Record<string, ProjectDetailCombo[]>
}

/**
 * Loads sites, POs, systems, deliverables, activities for New/Edit timesheet.
 * Non-admins: POs from Bill Rates by Person; sites derived from those POs.
 * Pass entryPoIds when editing to merge POs already on the sheet (historical / inactive PO rows).
 */
export async function loadTimesheetDropdownData(params: {
  supabase: SupabaseClient
  admin: SupabaseClient
  userId: string
  userRole: string
  entryPoIds?: string[]
}): Promise<TimesheetDropdownPayload> {
  const { supabase, admin, userId, userRole, entryPoIds = [] } = params
  const isAdmin = ['admin', 'super_admin'].includes(userRole)

  let sites: any[] = []
  let purchaseOrders: any[] = []
  let systems: any[] = []
  let deliverables: any[] = []
  let activities: any[] = []

  if (isAdmin) {
    const [sitesResult, purchaseOrdersResult, systemsResult, deliverablesResult, activitiesResult] = await Promise.all([
      withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
      withQueryTimeout(() => supabase.from('purchase_orders').select('*').eq('active', true).order('po_number')),
      withQueryTimeout(() => supabase.from('systems').select('*').order('name')),
      withQueryTimeout(() => supabase.from('deliverables').select('*').order('name')),
      withQueryTimeout(() => supabase.from('activities').select('*').order('name')),
    ])
    sites = (sitesResult.data || []) as any[]
    purchaseOrders = (purchaseOrdersResult.data || []) as any[]
    systems = (systemsResult.data || []) as any[]
    deliverables = (deliverablesResult.data || []) as any[]
    activities = (activitiesResult.data || []) as any[]
  } else {
    const billRatePoIds = await getBillRatePoIdsForUser(admin, userId)
    const mergedPoIds = [...new Set([...billRatePoIds, ...entryPoIds.filter(Boolean)])]

    if (mergedPoIds.length === 0) {
      return {
        sites: [],
        purchaseOrders: [],
        systems: [],
        deliverables: [],
        activities: [],
        deliverablePOIds: {},
        deliverableDepartmentIds: {},
        activityPOIds: {},
        projectBudgetCombosByPo: {},
      }
    }

    const includeHistoricalInactive = entryPoIds.some(Boolean)
    let poQuery = admin.from('purchase_orders').select('*').in('id', mergedPoIds).order('po_number')
    if (!includeHistoricalInactive) {
      poQuery = poQuery.eq('active', true)
    }
    const purchaseOrdersResult = await withQueryTimeout(() => poQuery)
    purchaseOrders = (purchaseOrdersResult.data || []) as any[]

    const userSiteIds = [...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean))]
    const deptFromPos = purchaseOrders.map((p: any) => p.department_id).filter(Boolean) as string[]
    const userDepartmentIds = [...new Set(deptFromPos)]

    if (userSiteIds.length === 0) {
      return {
        sites: [],
        purchaseOrders,
        systems: [],
        deliverables: [],
        activities: [],
        deliverablePOIds: {},
        deliverableDepartmentIds: {},
        activityPOIds: {},
        projectBudgetCombosByPo: {},
      }
    }

    const [sitesResult, systemsResult, deliverablesResult, activitiesResult, departmentsResult] = await Promise.all([
      withQueryTimeout(() => admin.from('sites').select('*').in('id', userSiteIds).order('name')),
      withQueryTimeout(() => admin.from('systems').select('*').order('name').in('site_id', userSiteIds)),
      withQueryTimeout(() => admin.from('deliverables').select('*').order('name').in('site_id', userSiteIds)),
      withQueryTimeout(() => admin.from('activities').select('*').order('name').in('site_id', userSiteIds)),
      withQueryTimeout<Array<{ id: string }>>(() =>
        supabase.from('departments').select('id').in('site_id', userSiteIds)
      ),
    ])
    sites = (sitesResult.data || []) as any[]
    systems = (systemsResult.data || []) as any[]
    deliverables = (deliverablesResult.data || []) as any[]
    activities = (activitiesResult.data || []) as any[]
    const departmentsAtSites = (departmentsResult.data || []) as Array<{ id: string }>

    const effectivePOIds = purchaseOrders.map((p: any) => p.id)
    const effectiveDepartmentIds =
      userDepartmentIds.length > 0 ? userDepartmentIds : departmentsAtSites.map((d) => d.id)

    if (systems.length > 0 || deliverables.length > 0 || activities.length > 0) {
      const filterByDeptAndPo = async (
        itemIds: string[],
        deptJunction: string,
        poJunction: string,
        itemIdCol: string
      ): Promise<Set<string>> => {
        if (itemIds.length === 0) return new Set()
        const [deptRes, poRes] = await Promise.all([
          withQueryTimeout<Array<{ [k: string]: string }>>(() =>
            supabase.from(deptJunction).select(itemIdCol + ',department_id').in(itemIdCol, itemIds)
          ),
          withQueryTimeout<Array<{ [k: string]: string }>>(() =>
            supabase.from(poJunction).select(itemIdCol + ',purchase_order_id').in(itemIdCol, itemIds)
          ),
        ])
        const deptRows = (deptRes.data || []) as Array<{ department_id: string } & Record<string, string>>
        const poRows = (poRes.data || []) as Array<{ purchase_order_id: string } & Record<string, string>>
        const itemDepts: Record<string, string[]> = {}
        const itemPOs: Record<string, string[]> = {}
        itemIds.forEach((id) => {
          itemDepts[id] = deptRows.filter((r) => r[itemIdCol] === id).map((r) => r.department_id)
          itemPOs[id] = poRows.filter((r) => r[itemIdCol] === id).map((r) => r.purchase_order_id)
        })
        const allowed = new Set<string>()
        itemIds.forEach((id) => {
          const depts = itemDepts[id] || []
          const pos = itemPOs[id] || []
          const deptOk = depts.length === 0 || depts.some((d) => effectiveDepartmentIds.includes(d))
          const poOk = pos.length === 0 || pos.some((p) => effectivePOIds.includes(p))
          if (deptOk && poOk) allowed.add(id)
        })
        return allowed
      }
      const [sysAllowed, delAllowed, actAllowed] = await Promise.all([
        filterByDeptAndPo(systems.map((s) => s.id), 'system_departments', 'system_purchase_orders', 'system_id'),
        filterByDeptAndPo(
          deliverables.map((d) => d.id),
          'deliverable_departments',
          'deliverable_purchase_orders',
          'deliverable_id'
        ),
        filterByDeptAndPo(activities.map((a) => a.id), 'activity_departments', 'activity_purchase_orders', 'activity_id'),
      ])
      systems = systems.filter((s) => sysAllowed.has(s.id))
      deliverables = deliverables.filter((d) => delAllowed.has(d.id))
      activities = activities.filter((a) => actAllowed.has(a.id))
    }
  }

  deliverables = Array.from(new Map(deliverables.map((d: any) => [d.id, d])).values())
  activities = Array.from(new Map(activities.map((a: any) => [a.id, a])).values())

  let deliverablePOIds: Record<string, string[]> = {}
  let deliverableDepartmentIds: Record<string, string[]> = {}
  let activityPOIds: Record<string, string[]> = {}
  if (deliverables.length > 0 || activities.length > 0) {
    const [delPORes, delDeptRes, actPORes] = await Promise.all([
      deliverables.length > 0
        ? withQueryTimeout<Array<{ deliverable_id: string; purchase_order_id: string }>>(() =>
            supabase
              .from('deliverable_purchase_orders')
              .select('deliverable_id,purchase_order_id')
              .in('deliverable_id', deliverables.map((d: any) => d.id))
          )
        : Promise.resolve({ data: [] }),
      deliverables.length > 0
        ? withQueryTimeout<Array<{ deliverable_id: string; department_id: string }>>(() =>
            supabase
              .from('deliverable_departments')
              .select('deliverable_id,department_id')
              .in('deliverable_id', deliverables.map((d: any) => d.id))
          )
        : Promise.resolve({ data: [] }),
      activities.length > 0
        ? withQueryTimeout<Array<{ activity_id: string; purchase_order_id: string }>>(() =>
            supabase
              .from('activity_purchase_orders')
              .select('activity_id,purchase_order_id')
              .in('activity_id', activities.map((a: any) => a.id))
          )
        : Promise.resolve({ data: [] }),
    ])
    ;(delPORes.data || []).forEach((r: any) => {
      if (!deliverablePOIds[r.deliverable_id]) deliverablePOIds[r.deliverable_id] = []
      deliverablePOIds[r.deliverable_id].push(r.purchase_order_id)
    })
    ;(delDeptRes.data || []).forEach((r: any) => {
      if (!deliverableDepartmentIds[r.deliverable_id]) deliverableDepartmentIds[r.deliverable_id] = []
      deliverableDepartmentIds[r.deliverable_id].push(r.department_id)
    })
    ;(actPORes.data || []).forEach((r: any) => {
      if (!activityPOIds[r.activity_id]) activityPOIds[r.activity_id] = []
      activityPOIds[r.activity_id].push(r.purchase_order_id)
    })
  }

  // Build the strict (system, deliverable, activity) allowlist for project-
  // budget POs. We pull project_details for any PO with budget_type='project'
  // visible to this user; the timesheet form uses this to keep dropdowns in
  // sync with the actual matrix cells so users can't pick combos that won't
  // appear on the project matrix.
  const projectBudgetCombosByPo: Record<string, ProjectDetailCombo[]> = {}
  const projectBudgetPoIds = (purchaseOrders as Array<{ id: string; budget_type?: string }>)
    .filter((p) => p.budget_type === 'project')
    .map((p) => p.id)
  if (projectBudgetPoIds.length > 0) {
    const { data: detailRows } = await admin
      .from('project_details')
      .select('po_id, system_id, deliverable_id, activity_id')
      .in('po_id', projectBudgetPoIds)
    for (const row of (detailRows || []) as Array<{
      po_id: string
      system_id: string | null
      deliverable_id: string | null
      activity_id: string | null
    }>) {
      if (!row.system_id || !row.deliverable_id || !row.activity_id) continue
      const list = projectBudgetCombosByPo[row.po_id] || (projectBudgetCombosByPo[row.po_id] = [])
      list.push({
        systemId: row.system_id,
        deliverableId: row.deliverable_id,
        activityId: row.activity_id,
      })
    }
  }

  return {
    sites,
    purchaseOrders,
    systems,
    deliverables,
    activities,
    deliverablePOIds,
    deliverableDepartmentIds,
    activityPOIds,
    projectBudgetCombosByPo,
  }
}
