/**
 * Parallel pre-stage: PO budget "Timesheet approver" grants must all sign
 * before the employee's normal profile approval chain.
 *
 * Rules (product):
 * - Only po_budget_access rows with timesheet_approver = true
 * - Only POs with hours > 0 on the timesheet (listed with 0 hours → skip)
 * - Exclude the submitter
 * - Exclude anyone already on the profile chain (they approve later, once)
 * - Skip entirely when the timesheet owner is admin / super_admin
 * - Live list: revoke / uncheck drops them from the required set mid-flight
 * - All remaining must sign before profile chain starts
 *
 * View scoping (Client + budget timesheet approvers):
 * - Detail / export / hour summaries show only billable rows on their granted
 *   charged POs (hours > 0). Other POs, null-PO rows, non-billable, and notes
 *   are hidden. Profile-chain / owner / admin still see the full sheet.
 */

import { buildApprovalChain } from '@/lib/timesheet-auto-approve'
import { getCalendarDateStringInAppTimezone } from '@/lib/utils'
import { isClientRole } from '@/lib/client-access'

export type ApprovalProfileFields = {
  reports_to_id?: string | null
  supervisor_id?: string | null
  manager_id?: string | null
  final_approver_id?: string | null
}

type EntryHoursRow = {
  po_id?: string | null
  mon_hours?: number | null
  tue_hours?: number | null
  wed_hours?: number | null
  thu_hours?: number | null
  fri_hours?: number | null
  sat_hours?: number | null
  sun_hours?: number | null
}

export function entryTotalHours(entry: EntryHoursRow): number {
  return (
    Number(entry.mon_hours || 0) +
    Number(entry.tue_hours || 0) +
    Number(entry.wed_hours || 0) +
    Number(entry.thu_hours || 0) +
    Number(entry.fri_hours || 0) +
    Number(entry.sat_hours || 0) +
    Number(entry.sun_hours || 0)
  )
}

/** PO ids on this timesheet that have at least some hours charged. */
export function poIdsWithHours(entries: EntryHoursRow[]): string[] {
  const hoursByPo: Record<string, number> = {}
  for (const entry of entries) {
    const poId = entry.po_id
    if (!poId) continue
    hoursByPo[poId] = (hoursByPo[poId] || 0) + entryTotalHours(entry)
  }
  return Object.keys(hoursByPo).filter((poId) => hoursByPo[poId] > 0)
}

/** True when the timesheet owner skips the budget timesheet-approver stage. */
async function ownerSkipsBudgetApproverStage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  employeeUserId: string
): Promise<boolean> {
  const { data } = await adminSupabase
    .from('user_profiles')
    .select('role')
    .eq('id', employeeUserId)
    .maybeSingle()
  const role = (data as { role?: string } | null)?.role
  return role === 'admin' || role === 'super_admin'
}

/**
 * Live required budget-approver user ids for a timesheet (unordered uniqueness,
 * returned sorted for stable UI).
 */
export async function getRequiredBudgetApproverIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  timesheetId: string,
  employeeUserId: string,
  profile: ApprovalProfileFields | null
): Promise<string[]> {
  // Admin / super_admin owned timesheets do not wait on budget approvers.
  if (await ownerSkipsBudgetApproverStage(adminSupabase, employeeUserId)) {
    return []
  }

  const { data: entries } = await adminSupabase
    .from('timesheet_entries')
    .select('po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .eq('timesheet_id', timesheetId)

  const chargedPoIds = poIdsWithHours((entries || []) as EntryHoursRow[])
  if (chargedPoIds.length === 0) return []

  const { data: accessRows } = await adminSupabase
    .from('po_budget_access')
    .select('user_id')
    .in('purchase_order_id', chargedPoIds)
    .eq('timesheet_approver', true)

  const profileChain = new Set(buildApprovalChain(profile))
  const ids = new Set<string>()
  for (const row of accessRows || []) {
    const uid = row?.user_id as string | undefined
    if (!uid) continue
    if (uid === employeeUserId) continue
    if (profileChain.has(uid)) continue
    ids.add(uid)
  }
  return [...ids].sort()
}

export function pendingBudgetApproverIds(
  requiredIds: string[],
  signedIds: Iterable<string>
): string[] {
  const signed = signedIds instanceof Set ? signedIds : new Set(signedIds)
  return requiredIds.filter((id) => !signed.has(id))
}

export function isBudgetStageComplete(
  requiredIds: string[],
  signedIds: Iterable<string>
): boolean {
  return pendingBudgetApproverIds(requiredIds, signedIds).length === 0
}

export type ApprovalStage =
  | { kind: 'budget'; requiredIds: string[]; pendingIds: string[] }
  | { kind: 'profile'; nextId: string }
  | { kind: 'done' }

/** Resolve whether we are still in the parallel budget stage or the profile chain. */
export function resolveApprovalStage(
  requiredBudgetIds: string[],
  profile: ApprovalProfileFields | null,
  signedIds: Iterable<string>
): ApprovalStage {
  const signed = signedIds instanceof Set ? signedIds : new Set(signedIds)
  const pendingBudget = pendingBudgetApproverIds(requiredBudgetIds, signed)
  if (pendingBudget.length > 0) {
    return { kind: 'budget', requiredIds: requiredBudgetIds, pendingIds: pendingBudget }
  }
  const chain = buildApprovalChain(profile)
  const nextId = chain.find((uid) => !signed.has(uid))
  if (nextId) return { kind: 'profile', nextId }
  return { kind: 'done' }
}

/**
 * True when this user is currently allowed to act (budget pending set, or
 * single next profile approver). Does not consider admin/delegation.
 */
export function userIsCurrentApprover(
  stage: ApprovalStage,
  userId: string
): boolean {
  if (stage.kind === 'budget') return stage.pendingIds.includes(userId)
  if (stage.kind === 'profile') return stage.nextId === userId
  return false
}

/** Batch helper: required budget approvers for many timesheets (one entries query + one access query). */
export async function getRequiredBudgetApproverIdsByTimesheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  timesheets: Array<{
    id: string
    user_id: string
    user_profiles?: ApprovalProfileFields | null
  }>
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {}
  if (timesheets.length === 0) return result
  for (const ts of timesheets) result[ts.id] = []

  const ownerIds = [...new Set(timesheets.map((t) => t.user_id).filter(Boolean))]
  const adminOwnerIds = new Set<string>()
  if (ownerIds.length > 0) {
    const { data: ownerProfiles } = await adminSupabase
      .from('user_profiles')
      .select('id, role')
      .in('id', ownerIds)
    for (const p of ownerProfiles || []) {
      if (p?.role === 'admin' || p?.role === 'super_admin') {
        adminOwnerIds.add(p.id as string)
      }
    }
  }

  const nonAdminTimesheets = timesheets.filter((t) => !adminOwnerIds.has(t.user_id))
  if (nonAdminTimesheets.length === 0) return result

  const timesheetIds = nonAdminTimesheets.map((t) => t.id)
  const { data: entries } = await adminSupabase
    .from('timesheet_entries')
    .select('timesheet_id, po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .in('timesheet_id', timesheetIds)

  const chargedPoIdsByTimesheet: Record<string, string[]> = {}
  const allChargedPoIds = new Set<string>()
  const entriesByTs: Record<string, EntryHoursRow[]> = {}
  for (const row of entries || []) {
    const tid = row.timesheet_id as string
    if (!entriesByTs[tid]) entriesByTs[tid] = []
    entriesByTs[tid].push(row as EntryHoursRow)
  }
  for (const ts of nonAdminTimesheets) {
    const charged = poIdsWithHours(entriesByTs[ts.id] || [])
    chargedPoIdsByTimesheet[ts.id] = charged
    charged.forEach((id) => allChargedPoIds.add(id))
  }

  if (allChargedPoIds.size === 0) return result

  const { data: accessRows } = await adminSupabase
    .from('po_budget_access')
    .select('user_id, purchase_order_id')
    .in('purchase_order_id', [...allChargedPoIds])
    .eq('timesheet_approver', true)

  const approversByPo: Record<string, string[]> = {}
  for (const row of accessRows || []) {
    const poId = row.purchase_order_id as string
    const uid = row.user_id as string
    if (!poId || !uid) continue
    if (!approversByPo[poId]) approversByPo[poId] = []
    if (!approversByPo[poId].includes(uid)) approversByPo[poId].push(uid)
  }

  for (const ts of nonAdminTimesheets) {
    const profile = (ts.user_profiles || null) as ApprovalProfileFields | null
    const profileChain = new Set(buildApprovalChain(profile))
    const ids = new Set<string>()
    for (const poId of chargedPoIdsByTimesheet[ts.id] || []) {
      for (const uid of approversByPo[poId] || []) {
        if (uid === ts.user_id) continue
        if (profileChain.has(uid)) continue
        ids.add(uid)
      }
    }
    result[ts.id] = [...ids].sort()
  }

  return result
}

/** Format: "approving for PO 12345" or "approving for PO 12345, PO 67890". */
export function formatApprovingForPoLabel(poNumbers: string[]): string {
  const cleaned = poNumbers.map((n) => String(n || '').trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  return `approving for ${cleaned.map((n) => (n.toUpperCase().startsWith('PO ') ? n : `PO ${n}`)).join(', ')}`
}

/** Format: "Jane Smith - approving for PO 12345". Falls back to name only if no POs. */
export function formatBudgetApproverDisplayName(name: string, poNumbers: string[]): string {
  const base = (name || 'Unknown').trim() || 'Unknown'
  const label = formatApprovingForPoLabel(poNumbers)
  return label ? `${base} - ${label}` : base
}

/**
 * For each timesheet, map each budget timesheet-approver user id → PO numbers
 * (charged hours only, excluding submitter / profile-chain people).
 */
export async function getBudgetApproverPoNumbersByTimesheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  timesheets: Array<{
    id: string
    user_id: string
    user_profiles?: ApprovalProfileFields | null
  }>
): Promise<Record<string, Record<string, string[]>>> {
  const result: Record<string, Record<string, string[]>> = {}
  if (timesheets.length === 0) return result
  for (const ts of timesheets) result[ts.id] = {}

  const ownerIds = [...new Set(timesheets.map((t) => t.user_id).filter(Boolean))]
  const adminOwnerIds = new Set<string>()
  if (ownerIds.length > 0) {
    const { data: ownerProfiles } = await adminSupabase
      .from('user_profiles')
      .select('id, role')
      .in('id', ownerIds)
    for (const p of ownerProfiles || []) {
      if (p?.role === 'admin' || p?.role === 'super_admin') {
        adminOwnerIds.add(p.id as string)
      }
    }
  }

  const nonAdminTimesheets = timesheets.filter((t) => !adminOwnerIds.has(t.user_id))
  if (nonAdminTimesheets.length === 0) return result

  const timesheetIds = nonAdminTimesheets.map((t) => t.id)
  const { data: entries } = await adminSupabase
    .from('timesheet_entries')
    .select('timesheet_id, po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .in('timesheet_id', timesheetIds)

  const chargedPoIdsByTimesheet: Record<string, string[]> = {}
  const allChargedPoIds = new Set<string>()
  const entriesByTs: Record<string, EntryHoursRow[]> = {}
  for (const row of entries || []) {
    const tid = row.timesheet_id as string
    if (!entriesByTs[tid]) entriesByTs[tid] = []
    entriesByTs[tid].push(row as EntryHoursRow)
  }
  for (const ts of nonAdminTimesheets) {
    const charged = poIdsWithHours(entriesByTs[ts.id] || [])
    chargedPoIdsByTimesheet[ts.id] = charged
    charged.forEach((id) => allChargedPoIds.add(id))
  }
  if (allChargedPoIds.size === 0) return result

  const { data: poRows } = await adminSupabase
    .from('purchase_orders')
    .select('id, po_number')
    .in('id', [...allChargedPoIds])
  const poNumberById: Record<string, string> = {}
  for (const row of poRows || []) {
    if (row?.id) poNumberById[row.id] = String(row.po_number || row.id)
  }

  const { data: accessRows } = await adminSupabase
    .from('po_budget_access')
    .select('user_id, purchase_order_id')
    .in('purchase_order_id', [...allChargedPoIds])
    .eq('timesheet_approver', true)

  const poIdsByUser: Record<string, string[]> = {}
  for (const row of accessRows || []) {
    const poId = row.purchase_order_id as string
    const uid = row.user_id as string
    if (!poId || !uid) continue
    if (!poIdsByUser[uid]) poIdsByUser[uid] = []
    if (!poIdsByUser[uid].includes(poId)) poIdsByUser[uid].push(poId)
  }

  for (const ts of nonAdminTimesheets) {
    const profile = (ts.user_profiles || null) as ApprovalProfileFields | null
    const profileChain = new Set(buildApprovalChain(profile))
    const charged = new Set(chargedPoIdsByTimesheet[ts.id] || [])
    const byUser: Record<string, string[]> = {}
    for (const [uid, poIds] of Object.entries(poIdsByUser)) {
      if (uid === ts.user_id) continue
      if (profileChain.has(uid)) continue
      const nums = poIds
        .filter((poId) => charged.has(poId))
        .map((poId) => poNumberById[poId] || poId)
        .sort((a, b) => a.localeCompare(b))
      if (nums.length > 0) byUser[uid] = nums
    }
    result[ts.id] = byUser
  }

  return result
}

/** Convenience: PO numbers one budget approver is covering on one timesheet. */
export async function getBudgetApproverPoNumbersForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  timesheetId: string,
  employeeUserId: string,
  profile: ApprovalProfileFields | null,
  approverUserId: string
): Promise<string[]> {
  const map = await getBudgetApproverPoNumbersByTimesheet(adminSupabase, [
    { id: timesheetId, user_id: employeeUserId, user_profiles: profile },
  ])
  return map[timesheetId]?.[approverUserId] || []
}

/** Full sheet vs PO-scoped view for Client / budget timesheet approvers. */
export type TimesheetApproverViewScope =
  | { mode: 'full' }
  | { mode: 'scoped'; poIds: string[] }

/**
 * Billable rows visible under a scoped approver view: granted PO + hours > 0.
 * Null-PO and zero-hour rows are excluded.
 */
export function filterBillableEntriesForApproverScope<T extends EntryHoursRow>(
  entries: T[],
  scope: TimesheetApproverViewScope
): T[] {
  if (scope.mode === 'full') return entries
  const allowed = new Set(scope.poIds)
  return entries.filter(
    (e) => !!e.po_id && allowed.has(e.po_id) && entryTotalHours(e) > 0
  )
}

/**
 * Resolve whether the viewer should see a PO-scoped timesheet (Client or
 * budget timesheet approver) or the full sheet (owner, admin, profile chain).
 *
 * When scoped via delegation, grants come from the active delegator(s) as well
 * as the viewer.
 */
export async function resolveTimesheetApproverViewScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  opts: {
    viewerId: string
    viewerRole: string
    timesheetUserId: string
    profile: ApprovalProfileFields | null
    entries: EntryHoursRow[]
    /** YYYY-MM-DD in app timezone; defaults to today. */
    today?: string
  }
): Promise<TimesheetApproverViewScope> {
  const { viewerId, viewerRole, timesheetUserId, profile, entries } = opts
  if (['admin', 'super_admin'].includes(viewerRole)) return { mode: 'full' }
  if (viewerId === timesheetUserId) return { mode: 'full' }

  const profileChain = buildApprovalChain(profile)
  if (profileChain.includes(viewerId)) return { mode: 'full' }

  const client = isClientRole(viewerRole)
  const chargedPoIds = poIdsWithHours(entries)
  const today = opts.today || getCalendarDateStringInAppTimezone()

  // Self + active inbound delegators (approving in someone else's place).
  const grantUserIds = new Set<string>([viewerId])
  const { data: dels } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', viewerId)
    .lte('start_date', today)
    .gte('end_date', today)
  for (const d of dels || []) {
    const delegatorId = d?.delegator_id as string | undefined
    if (!delegatorId) continue
    // Acting for a profile-chain approver → full sheet (same as that approver).
    if (profileChain.includes(delegatorId)) return { mode: 'full' }
    grantUserIds.add(delegatorId)
  }

  if (chargedPoIds.length === 0) {
    // Clients never see non-billable / notes even when there are no charged POs.
    return client ? { mode: 'scoped', poIds: [] } : { mode: 'full' }
  }

  const { data: accessRows } = await adminSupabase
    .from('po_budget_access')
    .select('user_id, purchase_order_id')
    .in('purchase_order_id', chargedPoIds)
    .in('user_id', [...grantUserIds])
    .eq('timesheet_approver', true)

  const poIds: string[] = Array.from(
    new Set(
      (accessRows || [])
        .map((r: { purchase_order_id?: string }) => r.purchase_order_id)
        .filter((id: string | undefined): id is string => !!id)
    )
  )

  if (client || poIds.length > 0) {
    return { mode: 'scoped', poIds }
  }

  return { mode: 'full' }
}

/**
 * Batch version of resolveTimesheetApproverViewScope for approval list hour totals.
 * Entries must include po_id + day hours; keyed by timesheet id.
 */
export async function resolveTimesheetApproverViewScopesByTimesheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  opts: {
    viewerId: string
    viewerRole: string
    timesheets: Array<{
      id: string
      user_id: string
      user_profiles?: ApprovalProfileFields | null
    }>
    entriesByTimesheet: Record<string, EntryHoursRow[]>
    today?: string
  }
): Promise<Record<string, TimesheetApproverViewScope>> {
  const result: Record<string, TimesheetApproverViewScope> = {}
  const { viewerId, viewerRole, timesheets, entriesByTimesheet } = opts
  if (timesheets.length === 0) return result

  if (['admin', 'super_admin'].includes(viewerRole)) {
    for (const ts of timesheets) result[ts.id] = { mode: 'full' }
    return result
  }

  const client = isClientRole(viewerRole)
  const today = opts.today || getCalendarDateStringInAppTimezone()

  const { data: dels } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id')
    .eq('delegate_id', viewerId)
    .lte('start_date', today)
    .gte('end_date', today)
  const inboundDelegatorIds: string[] = (dels || [])
    .map((d: { delegator_id?: string }) => d.delegator_id)
    .filter((id: string | undefined): id is string => !!id)

  const allCharged = new Set<string>()
  const chargedByTs: Record<string, string[]> = {}
  for (const ts of timesheets) {
    const charged = poIdsWithHours(entriesByTimesheet[ts.id] || [])
    chargedByTs[ts.id] = charged
    charged.forEach((id) => allCharged.add(id))
  }

  const grantUserIds = new Set<string>([viewerId, ...inboundDelegatorIds])
  let accessRows: Array<{ user_id: string; purchase_order_id: string }> = []
  if (allCharged.size > 0) {
    const { data } = await adminSupabase
      .from('po_budget_access')
      .select('user_id, purchase_order_id')
      .in('purchase_order_id', [...allCharged])
      .in('user_id', [...grantUserIds])
      .eq('timesheet_approver', true)
    accessRows = (data || []) as Array<{ user_id: string; purchase_order_id: string }>
  }

  const poIdsByUser: Record<string, Set<string>> = {}
  for (const row of accessRows) {
    if (!row.user_id || !row.purchase_order_id) continue
    if (!poIdsByUser[row.user_id]) poIdsByUser[row.user_id] = new Set()
    poIdsByUser[row.user_id].add(row.purchase_order_id)
  }

  for (const ts of timesheets) {
    if (viewerId === ts.user_id) {
      result[ts.id] = { mode: 'full' }
      continue
    }
    const profile = (ts.user_profiles || null) as ApprovalProfileFields | null
    const profileChain = buildApprovalChain(profile)
    if (profileChain.includes(viewerId)) {
      result[ts.id] = { mode: 'full' }
      continue
    }
    // Acting for a profile-chain approver on this sheet → full view.
    if (inboundDelegatorIds.some((uid) => profileChain.includes(uid))) {
      result[ts.id] = { mode: 'full' }
      continue
    }

    const charged = new Set(chargedByTs[ts.id] || [])
    if (charged.size === 0) {
      result[ts.id] = client ? { mode: 'scoped', poIds: [] } : { mode: 'full' }
      continue
    }

    const applicableGrantUsers = [viewerId, ...inboundDelegatorIds]
    const poIds = new Set<string>()
    for (const uid of applicableGrantUsers) {
      for (const poId of poIdsByUser[uid] || []) {
        if (charged.has(poId)) poIds.add(poId)
      }
    }

    if (client || poIds.size > 0) {
      result[ts.id] = { mode: 'scoped', poIds: [...poIds] }
    } else {
      result[ts.id] = { mode: 'full' }
    }
  }

  return result
}
