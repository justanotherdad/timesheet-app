/**
 * Load timesheets for the Approved Timesheets panel/page:
 * - fully approved for people in the viewer's profile chain
 * - any sheet the viewer signed (submitted or approved), including budget-only
 *
 * Newest week ending first, then employee name. PostgREST silently caps
 * unordered selects at ~1000 rows, which hid recent weeks (e.g. Sep 20).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ApprovedTimesheetFilters = {
  filterUser?: string
  filterStart?: string
  filterEnd?: string
  limit?: number
  offset?: number
}

export type ApprovedTimesheetsResult = {
  rows: any[]
  hasMore: boolean
}

const SELECT =
  '*, user_profiles!user_id(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)'

const IN_CHUNK = 150
const PAGE = 1000

function isoDate(value: string | undefined): string {
  return (value || '').slice(0, 10)
}

/** Calendar day after YYYY-MM-DD, for inclusive end-date comparisons. */
export function dayAfterIso(iso: string): string {
  const s = isoDate(iso)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return s
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

function applyFilters(query: any, filters: ApprovedTimesheetFilters) {
  let q = query
  if (filters.filterUser) q = q.eq('user_id', filters.filterUser)
  const start = isoDate(filters.filterStart)
  const end = isoDate(filters.filterEnd)
  if (start) q = q.gte('week_ending', start)
  // Exclusive next-day bound so a timestamp on the end date is still included.
  if (end) q = q.lt('week_ending', dayAfterIso(end))
  return q
}

function sortWeekEndingThenName(a: any, b: any) {
  const we = isoDate(b.week_ending).localeCompare(isoDate(a.week_ending))
  if (we !== 0) return we
  return String(a.user_profiles?.name || '')
    .toLowerCase()
    .localeCompare(String(b.user_profiles?.name || '').toLowerCase())
}

async function pagedSelectIds(
  run: (from: number, to: number) => Promise<{ data: { timesheet_id: string }[] | null }>
): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1)
    const rows = data || []
    for (const r of rows) {
      if (r.timesheet_id) ids.push(r.timesheet_id)
    }
    if (rows.length < PAGE) break
  }
  return [...new Set(ids)]
}

async function fetchOrderedChunks(
  ids: string[],
  fetchN: number,
  filters: ApprovedTimesheetFilters,
  admin: ReturnType<typeof createAdminClient>,
  applyIn: (q: any, chunk: string[]) => any
): Promise<any[]> {
  if (ids.length === 0 || fetchN <= 0) return []
  const out: any[] = []
  const seen = new Set<string>()
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    let q = admin.from('weekly_timesheets').select(SELECT)
    q = applyIn(q, chunk)
    q = applyFilters(q, filters)
    q = q.order('week_ending', { ascending: false }).limit(fetchN)
    const result = await withQueryTimeout(() => q)
    for (const ts of (result.data || []) as any[]) {
      if (!seen.has(ts.id)) {
        seen.add(ts.id)
        out.push(ts)
      }
    }
  }
  return out
}

export async function getApprovedTimesheetsForViewer(
  user: { id: string; profile: { role: string } },
  filters: ApprovedTimesheetFilters = {}
): Promise<ApprovedTimesheetsResult> {
  const adminSupabase = createAdminClient()
  const isClient = user.profile.role === 'client'
  const offset = Math.max(0, filters.offset || 0)
  const limit = filters.limit && filters.limit > 0 ? filters.limit : undefined
  const fetchN = limit ? offset + limit + 1 : PAGE

  const signedTimesheetIds = await pagedSelectIds((from, to) =>
    withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id')
        .eq('signer_id', user.id)
        .range(from, to)
    ) as Promise<{ data: { timesheet_id: string }[] | null }>
  )

  const seenIds = new Set<string>()
  const timesheets: any[] = []
  const pushUnique = (rows: any[]) => {
    for (const ts of rows) {
      if (!seenIds.has(ts.id)) {
        seenIds.add(ts.id)
        timesheets.push(ts)
      }
    }
  }

  if (isClient) {
    if (signedTimesheetIds.length === 0) return { rows: [], hasMore: false }
    pushUnique(
      await fetchOrderedChunks(signedTimesheetIds, fetchN, filters, adminSupabase, (q, chunk) =>
        q.in('id', chunk).in('status', ['approved', 'submitted'])
      )
    )
  } else {
    const chainIds: string[] = [user.id]
    for (let from = 0; ; from += PAGE) {
      const reportsResult = await withQueryTimeout(() =>
        adminSupabase
          .from('user_profiles')
          .select('id')
          .or(
            `reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`
          )
          .range(from, from + PAGE - 1)
      )
      const reports = (reportsResult.data || []) as { id: string }[]
      for (const r of reports) chainIds.push(r.id)
      if (reports.length < PAGE) break
    }

    if (chainIds.length > 0) {
      pushUnique(
        await fetchOrderedChunks(chainIds, fetchN, filters, adminSupabase, (q, chunk) =>
          q.eq('status', 'approved').in('user_id', chunk)
        )
      )
    }

    if (signedTimesheetIds.length > 0) {
      pushUnique(
        await fetchOrderedChunks(signedTimesheetIds, fetchN, filters, adminSupabase, (q, chunk) =>
          q.in('id', chunk).in('status', ['approved', 'submitted'])
        )
      )
    }
  }

  const sorted = [...timesheets].sort(sortWeekEndingThenName)
  if (!limit) return { rows: sorted, hasMore: false }

  const window = sorted.slice(offset, offset + limit + 1)
  const hasMore = window.length > limit
  return { rows: window.slice(0, limit), hasMore }
}
