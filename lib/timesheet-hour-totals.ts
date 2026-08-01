import type { SupabaseClient } from '@supabase/supabase-js'
import {
  entryTotalHours,
  resolveTimesheetApproverViewScopesByTimesheet,
  type ApprovalProfileFields,
  type TimesheetApproverViewScope,
} from '@/lib/budget-timesheet-approvers'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TimesheetHourTotals {
  billable: number
  unbillable: number
}

const DAY_COLS = [
  'mon_hours',
  'tue_hours',
  'wed_hours',
  'thu_hours',
  'fri_hours',
  'sat_hours',
  'sun_hours',
] as const

function sumDayHours(row: Record<string, any>): number {
  return DAY_COLS.reduce((sum, col) => sum + (Number(row[col]) || 0), 0)
}

/**
 * Returns billable (timesheet_entries) and unbillable (timesheet_unbillable)
 * hour totals per timesheet id. Used to surface a high-level weekly summary
 * (e.g. in the mobile approval popups) without loading each full timesheet.
 *
 * Uses whichever Supabase client is passed in — callers should pass an admin
 * client so approvers can read their reports' rows regardless of RLS.
 */
export async function getTimesheetHourTotals(
  db: SupabaseClient,
  timesheetIds: string[]
): Promise<Record<string, TimesheetHourTotals>> {
  const totals: Record<string, TimesheetHourTotals> = {}
  const ids = [...new Set(timesheetIds.filter(Boolean))]
  if (ids.length === 0) return totals

  for (const id of ids) {
    totals[id] = { billable: 0, unbillable: 0 }
  }

  const [entriesRes, unbillableRes] = await Promise.all([
    db
      .from('timesheet_entries')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
      .in('timesheet_id', ids),
    db
      .from('timesheet_unbillable')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
      .in('timesheet_id', ids),
  ])

  for (const row of (entriesRes.data as any[]) || []) {
    const tid = row.timesheet_id
    if (!totals[tid]) totals[tid] = { billable: 0, unbillable: 0 }
    totals[tid].billable += sumDayHours(row)
  }
  for (const row of (unbillableRes.data as any[]) || []) {
    const tid = row.timesheet_id
    if (!totals[tid]) totals[tid] = { billable: 0, unbillable: 0 }
    totals[tid].unbillable += sumDayHours(row)
  }

  return totals
}

/**
 * Hour totals for an approval-list viewer. Client / budget timesheet approvers
 * get billable hours only on their granted charged POs; unbillable is always 0
 * when scoped. Profile-chain / admin / owner keep full totals.
 */
export async function getTimesheetHourTotalsForApproverViewer(
  db: SupabaseClient,
  timesheets: Array<{
    id: string
    user_id: string
    user_profiles?: ApprovalProfileFields | null
  }>,
  viewer: { id: string; role: string }
): Promise<Record<string, TimesheetHourTotals>> {
  const totals: Record<string, TimesheetHourTotals> = {}
  const ids = [...new Set(timesheets.map((t) => t.id).filter(Boolean))]
  if (ids.length === 0) return totals

  for (const id of ids) {
    totals[id] = { billable: 0, unbillable: 0 }
  }

  const [entriesRes, unbillableRes] = await Promise.all([
    db
      .from('timesheet_entries')
      .select(
        'timesheet_id, po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
      )
      .in('timesheet_id', ids),
    db
      .from('timesheet_unbillable')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
      .in('timesheet_id', ids),
  ])

  const entriesByTimesheet: Record<string, any[]> = {}
  for (const row of (entriesRes.data as any[]) || []) {
    const tid = row.timesheet_id as string
    if (!entriesByTimesheet[tid]) entriesByTimesheet[tid] = []
    entriesByTimesheet[tid].push(row)
  }

  const scopes = await resolveTimesheetApproverViewScopesByTimesheet(db, {
    viewerId: viewer.id,
    viewerRole: viewer.role,
    timesheets,
    entriesByTimesheet,
  })

  for (const id of ids) {
    const scope: TimesheetApproverViewScope = scopes[id] || { mode: 'full' }
    if (scope.mode === 'scoped') {
      const allowed = new Set(scope.poIds)
      let billable = 0
      for (const row of entriesByTimesheet[id] || []) {
        if (!row.po_id || !allowed.has(row.po_id)) continue
        const hours = entryTotalHours(row)
        if (hours > 0) billable += hours
      }
      totals[id] = { billable, unbillable: 0 }
    } else {
      let billable = 0
      for (const row of entriesByTimesheet[id] || []) {
        billable += sumDayHours(row)
      }
      totals[id] = { billable, unbillable: 0 }
    }
  }

  // Full-view timesheets still include unbillable.
  for (const row of (unbillableRes.data as any[]) || []) {
    const tid = row.timesheet_id as string
    const scope = scopes[tid] || { mode: 'full' }
    if (scope.mode === 'scoped') continue
    if (!totals[tid]) totals[tid] = { billable: 0, unbillable: 0 }
    totals[tid].unbillable += sumDayHours(row)
  }

  return totals
}
