import type { SupabaseClient } from '@supabase/supabase-js'

export const TIMESHEET_CONFIRMATION_USER_IDS_KEY = 'timesheet_confirmation_user_ids'

/** company_settings value: JSON array of user profile UUID strings */
export function parseConfirmationAssigneeIds(settings: Record<string, string>): string[] {
  const raw = settings[TIMESHEET_CONFIRMATION_USER_IDS_KEY]?.trim()
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function stringifyConfirmationAssigneeIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

export const TIMESHEET_CONFIRMATION_SITE_FILTERS_KEY = 'timesheet_confirmation_site_filters'

/**
 * company_settings value: JSON object mapping a confirmation user id to an
 * array of site (client) ids they want to see confirmations for. A user with
 * no entry (or an empty array) sees confirmations for ALL clients.
 */
export function parseConfirmationSiteFilters(settings: Record<string, string>): Record<string, string[]> {
  const raw = settings[TIMESHEET_CONFIRMATION_SITE_FILTERS_KEY]?.trim()
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const ids = [...new Set(value.filter((x): x is string => typeof x === 'string' && x.length > 0))]
        if (ids.length) out[key] = ids
      }
    }
    return out
  } catch {
    return {}
  }
}

export function stringifyConfirmationSiteFilters(map: Record<string, string[]>): string {
  const clean: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(map || {})) {
    const ids = [...new Set((value || []).filter((x) => typeof x === 'string' && x.length > 0))]
    if (ids.length) clean[key] = ids
  }
  return JSON.stringify(clean)
}

export async function loadCompanySettingsMap(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data } = await supabase.from('company_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of data || []) {
    settings[(row as { key: string }).key] = (row as { value: string | null }).value ?? ''
  }
  return settings
}

/** Next sequence when transitioning to approved (increment each approval). */
export function nextApprovalConfirmationSequence(current: number | null | undefined): number {
  return (current ?? 0) + 1
}

export interface PendingConfirmation {
  id: string
  user_id: string
  week_ending: string
  week_starting: string | null
  approved_at: string | null
  employee_name: string
}

/** PostgREST URL/filter length limit — keep `.in()` lists under this size. */
const IN_CHUNK_SIZE = 150
/** Default PostgREST max rows; page until a short page to avoid silent truncation. */
const ENTRY_PAGE_SIZE = 1000

type ConfirmationEntryRow = {
  timesheet_id: string
  po_id: string | null
  client_project_id: string | null
}

/**
 * Run an `.in()` query in chunks so a large id list doesn't blow past
 * PostgREST's URL/filter length limit (surfaces as "Bad Request").
 */
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
 * Load timesheet_entries for many timesheet ids, chunking `.in()` and paging
 * each chunk so we don't hit the ~1000-row PostgREST cap.
 */
async function fetchConfirmationEntries(
  admin: SupabaseClient,
  timesheetIds: string[]
): Promise<ConfirmationEntryRow[]> {
  if (timesheetIds.length === 0) return []
  const out: ConfirmationEntryRow[] = []

  for (let i = 0; i < timesheetIds.length; i += IN_CHUNK_SIZE) {
    const idChunk = timesheetIds.slice(i, i + IN_CHUNK_SIZE)
    let from = 0
    for (;;) {
      const { data, error } = await admin
        .from('timesheet_entries')
        .select('timesheet_id, po_id, client_project_id')
        .in('timesheet_id', idChunk)
        .range(from, from + ENTRY_PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      const rows = (data || []) as ConfirmationEntryRow[]
      out.push(...rows)
      if (rows.length < ENTRY_PAGE_SIZE) break
      from += ENTRY_PAGE_SIZE
    }
  }

  return out
}

/**
 * Returns the approved timesheets still awaiting confirmation by `userId`,
 * honoring that user's per-user client (site) filter. A user with no filter
 * (or an empty list) sees confirmations for ALL clients.
 *
 * Shared by the confirmation list, the nav badge count, and the dashboard
 * card so all three always agree. Previously the counts skipped the site
 * filter, so a filtered user still saw the full unfiltered total.
 */
export async function getPendingConfirmationsForUser(
  admin: SupabaseClient,
  userId: string,
  settings: Record<string, string>
): Promise<PendingConfirmation[]> {
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(userId)) return []

  const { data: receipts } = await admin
    .from('timesheet_confirmation_receipts')
    .select('timesheet_id, approval_sequence')
    .eq('user_id', userId)
  const receiptKey = new Set(
    (receipts || []).map(
      (r) =>
        `${(r as { timesheet_id: string }).timesheet_id}:${(r as { approval_sequence: number }).approval_sequence}`
    )
  )

  const { data: approved } = await admin
    .from('weekly_timesheets')
    .select(
      'id, user_id, week_ending, week_starting, approval_confirmation_sequence, approved_at, user_profiles!user_id(name)'
    )
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })

  let pending = (approved || []).filter((row) => {
    const seq = (row as { approval_confirmation_sequence?: number }).approval_confirmation_sequence ?? 0
    if (seq <= 0) return false
    return !receiptKey.has(`${(row as { id: string }).id}:${seq}`)
  })

  const allowedSiteIds = parseConfirmationSiteFilters(settings)[userId] || []
  if (allowedSiteIds.length > 0 && pending.length > 0) {
    try {
      const pendingIds = pending.map((ts) => (ts as { id: string }).id)
      const entries = await fetchConfirmationEntries(admin, pendingIds)

      const poIds = [
        ...new Set(
          entries
            .map((e) => e.po_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        ),
      ]
      const poSiteById = new Map<string, string>()
      if (poIds.length > 0) {
        const pos = await fetchByIdsInChunks<{ id: string; site_id: string | null }>(poIds, (chunk) =>
          admin.from('purchase_orders').select('id, site_id').in('id', chunk)
        )
        for (const po of pos) {
          if (po.site_id) poSiteById.set(po.id, po.site_id)
        }
      }

      const allowed = new Set(allowedSiteIds)
      const timesheetSites = new Map<string, Set<string>>()
      for (const e of entries) {
        // Prefer the entry's client; fall back to the PO's site (same as data-view).
        const siteId =
          (typeof e.client_project_id === 'string' && e.client_project_id) ||
          (e.po_id ? poSiteById.get(e.po_id) : undefined) ||
          null
        if (!siteId) continue
        if (!timesheetSites.has(e.timesheet_id)) timesheetSites.set(e.timesheet_id, new Set())
        timesheetSites.get(e.timesheet_id)!.add(siteId)
      }

      pending = pending.filter((ts) => {
        const sites = timesheetSites.get((ts as { id: string }).id)
        if (!sites) return false
        for (const s of sites) if (allowed.has(s)) return true
        return false
      })
    } catch (err) {
      // Fail open: never wipe the whole list because a filter query failed
      // (e.g. oversized unchunked .in()). All-clients users never hit this
      // branch; filtered users must still see pending work.
      console.error('[timesheet-confirmation] site filter query failed; showing unfiltered pending', err)
    }
  }

  return pending.map((ts) => ({
    id: (ts as { id: string }).id,
    user_id: (ts as { user_id: string }).user_id,
    week_ending: (ts as { week_ending: string }).week_ending,
    week_starting: (ts as { week_starting: string | null }).week_starting ?? null,
    approved_at: (ts as { approved_at: string | null }).approved_at ?? null,
    employee_name: ((ts as { user_profiles?: { name?: string } }).user_profiles)?.name || 'Unknown',
  }))
}

/**
 * True when this timesheet would appear on `userId`'s Timesheet Confirmations
 * list (assignee, approved, current sequence not yet receipted, client filter).
 */
export async function isPendingConfirmationForUser(
  admin: SupabaseClient,
  userId: string,
  timesheet: { id: string; status?: string | null; approval_confirmation_sequence?: number | null },
  settings?: Record<string, string>
): Promise<boolean> {
  const map = settings ?? (await loadCompanySettingsMap(admin))
  const assignees = parseConfirmationAssigneeIds(map)
  if (assignees.length === 0 || !assignees.includes(userId)) return false
  if (timesheet.status !== 'approved') return false

  const seq = timesheet.approval_confirmation_sequence ?? 0
  if (seq <= 0) return false

  const { data: receipt } = await admin
    .from('timesheet_confirmation_receipts')
    .select('timesheet_id')
    .eq('user_id', userId)
    .eq('timesheet_id', timesheet.id)
    .eq('approval_sequence', seq)
    .maybeSingle()
  if (receipt) return false

  const allowedSiteIds = parseConfirmationSiteFilters(map)[userId] || []
  if (allowedSiteIds.length === 0) return true

  try {
    const entries = await fetchConfirmationEntries(admin, [timesheet.id])
    const poIds = [
      ...new Set(
        entries
          .map((e) => e.po_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]
    const poSiteById = new Map<string, string>()
    if (poIds.length > 0) {
      const pos = await fetchByIdsInChunks<{ id: string; site_id: string | null }>(poIds, (chunk) =>
        admin.from('purchase_orders').select('id, site_id').in('id', chunk)
      )
      for (const po of pos) {
        if (po.site_id) poSiteById.set(po.id, po.site_id)
      }
    }

    const allowed = new Set(allowedSiteIds)
    for (const e of entries) {
      const siteId =
        (typeof e.client_project_id === 'string' && e.client_project_id) ||
        (e.po_id ? poSiteById.get(e.po_id) : undefined) ||
        null
      if (siteId && allowed.has(siteId)) return true
    }
    return false
  } catch (err) {
    console.error('[timesheet-confirmation] single-sheet site filter failed; showing confirm button', err)
    return true
  }
}

