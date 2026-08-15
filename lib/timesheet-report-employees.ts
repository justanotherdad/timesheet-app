import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@/types/database'

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

  return scoped.map((p) => ({
    id: p.id,
    name: p.name || 'Unknown',
    employeeType: p.employee_type === 'internal' || p.employee_type === 'external' ? p.employee_type : null,
  }))
}
