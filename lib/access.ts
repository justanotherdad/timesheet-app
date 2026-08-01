import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { billRateIsActiveOnDate } from '@/lib/po-bill-rate-utils'

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
 * Site IDs implied by the given users' active PO bill rates.
 *
 * Bill Rates by Person is the current source of truth for which POs someone
 * works on, so the sites behind those POs count as assigned sites. Without this,
 * a manager set up entirely through PO bill rates has no `user_sites` rows and
 * sees an empty site list on every admin screen.
 *
 * Uses the service-role client: this is an internal authorization lookup, and
 * `po_bill_rates` is not readable by every role.
 */
async function getBillRateSiteIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []

  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('getBillRateSiteIds could not create admin client:', err)
    return []
  }

  const { data: rateRows, error: rateError } = await admin
    .from('po_bill_rates')
    .select('po_id, effective_from_date, effective_to_date')
    .in('user_id', userIds)
  if (rateError || !rateRows?.length) {
    if (rateError) console.error('getBillRateSiteIds bill rate query failed:', rateError)
    return []
  }

  const today = new Date().toISOString().slice(0, 10)
  const poIds = [
    ...new Set(
      (rateRows as { po_id: string; effective_from_date?: string | null; effective_to_date?: string | null }[])
        .filter((r) => r.po_id && billRateIsActiveOnDate(r, today))
        .map((r) => r.po_id)
    ),
  ]
  if (poIds.length === 0) return []

  const { data: pos, error: poError } = await admin
    .from('purchase_orders')
    .select('site_id, active')
    .in('id', poIds)
  if (poError || !pos?.length) {
    if (poError) console.error('getBillRateSiteIds purchase order query failed:', poError)
    return []
  }

  return [
    ...new Set(
      (pos as { site_id?: string | null; active?: boolean | null }[])
        .filter((p) => p.active !== false && p.site_id)
        .map((p) => p.site_id as string)
    ),
  ]
}

async function resolveSiteIds(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole,
  includeBillRateSites: boolean
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

  const [assignedResult, billRateSiteIds] = await Promise.all([
    supabase.from('user_sites').select('site_id').in('user_id', userIdsToCheck),
    includeBillRateSites ? getBillRateSiteIds(userIdsToCheck) : Promise.resolve([]),
  ])

  const { data, error } = assignedResult
  if (error) {
    // Return null (not []) so callers can distinguish a DB failure from a user
    // who genuinely has no site assignments. Returning [] on error would silently
    // deny access to everyone when the query fails.
    console.error('getAccessibleSiteIds query failed:', error)
    return null
  }

  const assignedSiteIds = ((data || []) as { site_id: string }[]).map((r) => r.site_id)
  return [...new Set([...assignedSiteIds, ...billRateSiteIds])]
}

/**
 * Get site IDs the current user can access for org/systems/activities/deliverables.
 * - Admin/Super admin: null = all sites (caller should not filter).
 * - Manager: sites assigned to them or their subordinates, via explicit
 *   `user_sites` rows plus the sites behind their active PO bill rates.
 * - Supervisor: the same two sources, for themselves only.
 */
export async function getAccessibleSiteIds(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<string[] | null> {
  return resolveSiteIds(supabase, userId, role, true)
}

/**
 * Check if user can access a PO budget (Budget Detail / balance popups).
 * Only Admin/Super Admin get automatic access. Everyone else needs an explicit
 * po_budget_access grant with can_view_budget = true.
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
    .select('user_id, can_view_budget')
    .eq('purchase_order_id', poId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return false
  // Missing column (pre-migration) treated as viewable for back-compat.
  return (data as { can_view_budget?: boolean }).can_view_budget !== false
}

/**
 * Get bid sheet IDs the user can access.
 * Admin/Super Admin: all (returns null). Everyone else (Manager / Supervisor /
 * Employee): explicit `bid_sheet_access` grants always count, plus, for non-
 * employees, any bid sheets at sites they're assigned to via `user_sites`.
 *
 * Returning `null` means "no filter — all sheets are accessible". An empty
 * array means "user has zero access; show nothing".
 */
export async function getAccessibleBidSheetIds(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<string[] | null> {
  if (role === 'admin' || role === 'super_admin') return null

  const { data: accessRows } = await supabase
    .from('bid_sheet_access')
    .select('bid_sheet_id')
    .eq('user_id', userId)
  const accessIds = (accessRows || []).map((r: { bid_sheet_id: string }) => r.bid_sheet_id)

  // Employees only ever see what they've been explicitly granted — no
  // site-wide auto-share. Manager/Supervisor get site-assigned sheets too.
  if (role === 'employee') {
    return accessIds.length > 0 ? accessIds : []
  }

  // Explicit `user_sites` assignments only. The bid sheet detail page and its
  // write routes gate on a direct `user_sites` lookup, so widening the list here
  // to bill-rate sites would surface sheets that bounce back on open.
  const accessibleSiteIds = await resolveSiteIds(supabase, userId, role, false)
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
