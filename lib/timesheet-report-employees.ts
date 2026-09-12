import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@/types/database'
import { billRateIsActiveOnDate } from '@/lib/po-bill-rate-utils'

const IN_CHUNK = 150

type ProfileRow = {
  id: string
  name: string
  role: string
  employee_type?: string | null
  active?: boolean | null
  supervisor_id?: string | null
  manager_id?: string | null
  final_approver_id?: string | null
}

export type TimesheetReportEmployee = {
  id: string
  name: string
  employeeType: 'internal' | 'external' | null
  siteIds: string[]
}

/**
 * Active non-client users the viewer may include on a Timesheet Report.
 * Admins/super_admins: everyone except clients (admin excludes super_admins,
 * matching Data View). Managers: people in their approval chain.
 */
export async function getTimesheetReportEmployees(
  admin: SupabaseClient,
  viewer: User
): Promise<TimesheetReportEmployee[]> {
  const { data: allProfiles } = await admin
    .from('user_profiles')
    .select('id, name, role, employee_type, active, supervisor_id, manager_id, final_approver_id')
    .order('name')

  const profiles = ((allProfiles || []) as ProfileRow[]).filter(
    (p) => p.role !== 'client' && p.active !== false
  )

  const role = viewer.role
  let scoped = profiles
  if (role === 'supervisor') {
    scoped = profiles.filter(
      (p) =>
        (p.supervisor_id === viewer.id ||
          p.manager_id === viewer.id ||
          p.final_approver_id === viewer.id) &&
        p.role === 'employee'
    )
  } else if (role === 'manager') {
    scoped = profiles.filter(
      (p) =>
        (p.supervisor_id === viewer.id ||
          p.manager_id === viewer.id ||
          p.final_approver_id === viewer.id) &&
        ['employee', 'supervisor'].includes(p.role)
    )
  } else if (role === 'admin') {
    scoped = profiles.filter((p) => p.role !== 'super_admin')
  }

  const base: Array<Omit<TimesheetReportEmployee, 'siteIds'>> = scoped.map((p) => ({
    id: p.id,
    name: p.name || 'Unknown',
    employeeType:
      p.employee_type === 'internal' || p.employee_type === 'external' ? p.employee_type : null,
  }))
  const siteIdsByUser = await loadSiteIdsByUserIds(
    admin,
    base.map((e) => e.id)
  )
  return base.map((e) => ({
    ...e,
    siteIds: [...(siteIdsByUser.get(e.id) || [])],
  }))
}

async function loadSiteIdsByUserIds(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Set<string>>> {
  const byUser = new Map<string, Set<string>>()
  for (const id of userIds) byUser.set(id, new Set())
  if (userIds.length === 0) return byUser

  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK)
    const { data } = await admin.from('user_sites').select('user_id, site_id').in('user_id', chunk)
    for (const row of (data || []) as { user_id: string; site_id: string }[]) {
      if (row.user_id && row.site_id) byUser.get(row.user_id)?.add(row.site_id)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const poUsers = new Map<string, Set<string>>()
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK)
    const { data } = await admin
      .from('po_bill_rates')
      .select('user_id, po_id, effective_from_date, effective_to_date')
      .in('user_id', chunk)
    for (const row of (data || []) as {
      user_id: string
      po_id: string
      effective_from_date?: string | null
      effective_to_date?: string | null
    }[]) {
      if (!row.po_id || !row.user_id || !billRateIsActiveOnDate(row, today)) continue
      if (!poUsers.has(row.po_id)) poUsers.set(row.po_id, new Set())
      poUsers.get(row.po_id)!.add(row.user_id)
    }
  }

  const poIds = [...poUsers.keys()]
  for (let i = 0; i < poIds.length; i += IN_CHUNK) {
    const chunk = poIds.slice(i, i + IN_CHUNK)
    const { data } = await admin.from('purchase_orders').select('id, site_id, active').in('id', chunk)
    for (const po of (data || []) as { id: string; site_id?: string | null; active?: boolean | null }[]) {
      if (po.active === false || !po.site_id) continue
      for (const uid of poUsers.get(po.id) || []) {
        byUser.get(uid)?.add(po.site_id)
      }
    }
  }

  return byUser
}
