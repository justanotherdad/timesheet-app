import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/database'

/**
 * Get user IDs that report to the given manager (directly or through supervisor).
 * Used to scope manager's access to their team.
 */
export async function getSubordinateUserIds(
  supabase: SupabaseClient,
  managerId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .or(`reports_to_id.eq.${managerId},supervisor_id.eq.${managerId},manager_id.eq.${managerId},final_approver_id.eq.${managerId}`)
  if (error || !data) return []
  return (data as { id: string }[]).map((r) => r.id)
}

/**
 * Get site IDs the current user can access for org/systems/activities/deliverables.
 * - Admin/Super admin: null = all sites (caller should not filter).
 * - Manager: sites assigned to them or their subordinates (user_sites).
 * - Supervisor: sites assigned to them (user_sites).
 */
export async function getAccessibleSiteIds(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<string[] | null> {
  if (role === 'admin' || role === 'super_admin') {
    return null
  }
  if (role === 'employee') {
    return []
  }

  let userIdsToCheck: string[] = [userId]
  if (role === 'manager') {
    const subordinateIds = await getSubordinateUserIds(supabase, userId)
    userIdsToCheck = [userId, ...subordinateIds]
  }

  const { data, error } = await supabase
    .from('user_sites')
    .select('site_id')
    .in('user_id', userIdsToCheck)
  if (error || !data) return []
  const siteIds = [...new Set((data as { site_id: string }[]).map((r) => r.site_id))]
  return siteIds
}

/**
 * Check if user can access a PO budget. Only Admin/Super Admin get automatic access.
 * Managers, Supervisors, and Employees must have explicit po_budget_access grant.
 */
export async function canAccessPoBudget(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  poId: string
): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data } = await supabase
    .from('po_budget_access')
    .select('user_id')
    .eq('purchase_order_id', poId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

/**
 * Get bid sheet IDs the user can access.
 * Admin/Super Admin: all. Manager/Supervisor: bid_sheet_access OR site assignment.
 */
export async function getAccessibleBidSheetIds(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<string[] | null> {
  if (role === 'admin' || role === 'super_admin') return null
  if (role === 'employee') return []

  const { data: accessRows } = await supabase
    .from('bid_sheet_access')
    .select('bid_sheet_id')
    .eq('user_id', userId)
  const accessIds = (accessRows || []).map((r: { bid_sheet_id: string }) => r.bid_sheet_id)

  const accessibleSiteIds = await getAccessibleSiteIds(supabase, userId, role)
  if (accessibleSiteIds && accessibleSiteIds.length > 0) {
    const { data: siteSheets } = await supabase
      .from('bid_sheets')
      .select('id')
      .in('site_id', accessibleSiteIds)
    const siteIds = (siteSheets || []).map((s: { id: string }) => s.id)
    return [...new Set([...accessIds, ...siteIds])]
  }
  return accessIds.length > 0 ? accessIds : []
}
