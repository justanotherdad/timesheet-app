/**
 * Load timesheets for the Approved Timesheets panel/page:
 * - fully approved for people in the viewer's profile chain
 * - any sheet the viewer signed (submitted or approved), including budget-only
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Filters = {
  filterUser?: string
  filterStart?: string
  filterEnd?: string
  limit?: number
}

function applyFilters(query: any, filters: Filters) {
  let q = query
  if (filters.filterUser) q = q.eq('user_id', filters.filterUser)
  if (filters.filterStart) q = q.gte('week_ending', filters.filterStart)
  if (filters.filterEnd) q = q.lte('week_ending', filters.filterEnd)
  return q
}

const SELECT =
  '*, user_profiles!user_id(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)'

export async function getApprovedTimesheetsForViewer(
  user: { id: string; profile: { role: string } },
  filters: Filters = {}
): Promise<any[]> {
  const adminSupabase = createAdminClient()
  const isClient = user.profile.role === 'client'

  const signedResult = await withQueryTimeout(() =>
    adminSupabase.from('timesheet_signatures').select('timesheet_id').eq('signer_id', user.id)
  )
  const signedTimesheetIds = [
    ...new Set(
      ((signedResult.data || []) as { timesheet_id: string }[]).map((r) => r.timesheet_id)
    ),
  ]

  if (isClient) {
    if (signedTimesheetIds.length === 0) return []
    let clientQuery = adminSupabase
      .from('weekly_timesheets')
      .select(SELECT)
      .in('id', signedTimesheetIds)
      .in('status', ['approved', 'submitted'])
    clientQuery = applyFilters(clientQuery, filters)
    const clientResult = await withQueryTimeout(() => clientQuery)
    let rows = (clientResult.data || []) as any[]
    if (filters.limit && filters.limit > 0) {
      rows = [...rows]
        .sort((a, b) => {
          const aVal = a.approved_at || a.submitted_at || a.created_at || ''
          const bVal = b.approved_at || b.submitted_at || b.created_at || ''
          return bVal.localeCompare(aVal)
        })
        .slice(0, filters.limit)
    }
    return rows
  }

  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(
        `reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`
      )
  )
  const reports = (reportsResult.data || []) as { id: string }[]
  const reportIds = reports.map((r) => r.id)
  const chainUserIds = [user.id, ...reportIds]

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

  // Fully approved for people in the profile chain (incl. self)
  if (chainUserIds.length > 0) {
    let approvedQuery = adminSupabase
      .from('weekly_timesheets')
      .select(SELECT)
      .eq('status', 'approved')
      .in('user_id', chainUserIds)
    approvedQuery = applyFilters(approvedQuery, filters)
    const approvedResult = await withQueryTimeout(() => approvedQuery)
    pushUnique((approvedResult.data || []) as any[])
  }

  // Anything this user signed: fully approved (e.g. budget-only) or still submitted
  if (signedTimesheetIds.length > 0) {
    let signedQuery = adminSupabase
      .from('weekly_timesheets')
      .select(SELECT)
      .in('id', signedTimesheetIds)
      .in('status', ['approved', 'submitted'])
    signedQuery = applyFilters(signedQuery, filters)
    const signedResultRows = await withQueryTimeout(() => signedQuery)
    pushUnique((signedResultRows.data || []) as any[])
  }

  if (filters.limit && filters.limit > 0) {
    return [...timesheets]
      .sort((a, b) => {
        const aVal = a.approved_at || a.submitted_at || a.created_at || ''
        const bVal = b.approved_at || b.submitted_at || b.created_at || ''
        return bVal.localeCompare(aVal)
      })
      .slice(0, filters.limit)
  }

  return timesheets
}
