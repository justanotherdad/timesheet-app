import type { SupabaseClient } from '@supabase/supabase-js'

const IN_CHUNK_SIZE = 150
const PAGE_SIZE = 1000

export type DataViewProfile = {
  id: string
  name: string
  supervisor_id?: string | null
  manager_id?: string | null
  final_approver_id?: string | null
  role: string
}

export type DataViewAccess = {
  /** Users whose timesheets may appear in View Timesheet Data. */
  accessibleUserIds: string[]
  /** Reports + self: full rows (all POs and unbillable). */
  fullViewUserIds: Set<string>
  /** POs the viewer has can_view_budget on. Unused for admin/super_admin. */
  grantedPoIds: Set<string>
  /** Sites of those granted POs — union into site scope so those rows are not dropped. */
  grantedSiteIds: string[]
}

async function fetchByIdsInChunks<T>(
  ids: string[],
  runChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  if (ids.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE)
    const { data, error } = await runChunk(chunk)
    if (error) throw new Error(error.message)
    if (data) out.push(...data)
  }
  return out
}

/**
 * People-scope for Data View: supervisors see employees on their chain;
 * managers see employees and supervisors on their chain; admin excludes
 * super_admins; super_admin sees everyone.
 */
export function getReportUserIdsForDataView(
  profiles: DataViewProfile[],
  viewerId: string,
  role: string
): string[] {
  if (role === 'supervisor') {
    return profiles
      .filter(
        (p) =>
          (p.supervisor_id === viewerId ||
            p.manager_id === viewerId ||
            p.final_approver_id === viewerId) &&
          p.role === 'employee'
      )
      .map((p) => p.id)
  }
  if (role === 'manager') {
    return profiles
      .filter(
        (p) =>
          (p.supervisor_id === viewerId ||
            p.manager_id === viewerId ||
            p.final_approver_id === viewerId) &&
          ['employee', 'supervisor'].includes(p.role)
      )
      .map((p) => p.id)
  }
  if (role === 'admin') {
    return profiles.filter((p) => p.role !== 'super_admin').map((p) => p.id)
  }
  return profiles.map((p) => p.id)
}

async function collectTimesheetIdsOnPos(
  admin: SupabaseClient,
  poIds: string[]
): Promise<string[]> {
  const ids = new Set<string>()
  for (let i = 0; i < poIds.length; i += IN_CHUNK_SIZE) {
    const chunk = poIds.slice(i, i + IN_CHUNK_SIZE)
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from('timesheet_entries')
        .select('timesheet_id')
        .in('po_id', chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      for (const row of data as { timesheet_id?: string }[]) {
        if (row.timesheet_id) ids.add(row.timesheet_id)
      }
      if (data.length < PAGE_SIZE) break
    }
  }
  return [...ids]
}

/**
 * Who the viewer may see in View Timesheet Data, and which rows are full vs
 * granted-PO-only.
 *
 * Supervisor / manager: reports (existing chain filter) ∪ self ∪ anyone who
 * charged time to a PO they can view. Budget-only people are not in
 * fullViewUserIds — callers must hide their other-PO and unbillable rows.
 */
export async function getDataViewAccess(
  admin: SupabaseClient,
  viewerId: string,
  role: string,
  profiles: DataViewProfile[]
): Promise<DataViewAccess> {
  if (role === 'admin' || role === 'super_admin') {
    const accessibleUserIds = getReportUserIdsForDataView(profiles, viewerId, role)
    return {
      accessibleUserIds,
      fullViewUserIds: new Set(accessibleUserIds),
      grantedPoIds: new Set(),
      grantedSiteIds: [],
    }
  }

  const reportIds = getReportUserIdsForDataView(profiles, viewerId, role)
  const fullViewUserIds = new Set<string>([viewerId, ...reportIds])

  const { data: accessRows, error: accessError } = await admin
    .from('po_budget_access')
    .select('purchase_order_id, can_view_budget')
    .eq('user_id', viewerId)
  if (accessError) throw new Error(accessError.message)

  const grantedPoIds = new Set(
    (accessRows || [])
      .filter((r: { can_view_budget?: boolean | null }) => r.can_view_budget !== false)
      .map((r: { purchase_order_id?: string }) => r.purchase_order_id)
      .filter((id: string | undefined): id is string => !!id)
  )

  let budgetChargerIds: string[] = []
  let grantedSiteIds: string[] = []

  if (grantedPoIds.size > 0) {
    const poIdList = [...grantedPoIds]
    const pos = await fetchByIdsInChunks<{ id: string; site_id?: string | null }>(poIdList, (chunk) =>
      admin.from('purchase_orders').select('id, site_id').in('id', chunk)
    )
    grantedSiteIds = [
      ...new Set(pos.map((p) => p.site_id).filter((id): id is string => !!id)),
    ]

    const timesheetIds = await collectTimesheetIdsOnPos(admin, poIdList)
    const sheets = await fetchByIdsInChunks<{ user_id: string }>(timesheetIds, (chunk) =>
      admin.from('weekly_timesheets').select('user_id').in('id', chunk)
    )
    budgetChargerIds = [...new Set(sheets.map((s) => s.user_id).filter(Boolean))]
  }

  return {
    accessibleUserIds: [...new Set([...fullViewUserIds, ...budgetChargerIds])],
    fullViewUserIds,
    grantedPoIds,
    grantedSiteIds,
  }
}

/** null = unrestricted (admin). Otherwise union granted-PO sites into the list. */
export function mergeDataViewSiteScope(
  accessibleSiteIds: string[] | null,
  grantedSiteIds: string[]
): string[] | null {
  if (accessibleSiteIds === null) return null
  return [...new Set([...accessibleSiteIds, ...grantedSiteIds])]
}
