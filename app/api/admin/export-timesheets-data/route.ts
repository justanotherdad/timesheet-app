import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { fetchByIds, fetchInIdChunksPaged } from '@/lib/supabase-fetch'

/* eslint-disable @typescript-eslint/no-explicit-any */

function uniqueIds(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0)))
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return rows.reduce((acc: Record<string, T>, row) => {
    acc[row.id] = row
    return acc
  }, {})
}

function sortEntries(a: any, b: any) {
  const aNull = a.sort_order == null
  const bNull = b.sort_order == null
  if (aNull && !bNull) return -1
  if (!aNull && bNull) return 1
  if (!aNull && !bNull && a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin'])
    const supabase = createAdminClient()
    const { timesheetIds } = await request.json()

    if (!timesheetIds || !Array.isArray(timesheetIds) || timesheetIds.length === 0) {
      return NextResponse.json({ error: 'Invalid timesheet IDs' }, { status: 400 })
    }

    const ids = uniqueIds(timesheetIds)

    const timesheetSelect = `
        *,
        user_profiles!user_id (
          id,
          name,
          email,
          supervisor_id,
          manager_id,
          final_approver_id
        )
      `

    const [timesheets, entries, unbillable, signatures] = await Promise.all([
      fetchByIds<any>(ids, (chunk) =>
        supabase.from('weekly_timesheets').select(timesheetSelect).in('id', chunk)
      ),
      fetchInIdChunksPaged<any>(ids, (chunk, from, to) =>
        supabase
          .from('timesheet_entries')
          .select('*')
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchInIdChunksPaged<any>(ids, (chunk, from, to) =>
        supabase
          .from('timesheet_unbillable')
          .select('*')
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchInIdChunksPaged<any>(ids, (chunk, from, to) =>
        supabase
          .from('timesheet_signatures')
          .select(`
            *,
            user_profiles!signer_id (
              id,
              name
            )
          `)
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ])

    const siteIds = uniqueIds(entries.map((e: any) => e.client_project_id))
    const poIds = uniqueIds(entries.map((e: any) => e.po_id))
    const systemIds = uniqueIds(entries.map((e: any) => e.system_id))
    const deliverableIds = uniqueIds(entries.map((e: any) => e.deliverable_id))
    const activityIds = uniqueIds(entries.map((e: any) => e.activity_id))

    const [sitesRows, posRows, systemsRows, deliverablesRows, activitiesRows] = await Promise.all([
      fetchByIds<any>(siteIds, (chunk) => supabase.from('sites').select('id, name, code').in('id', chunk)),
      fetchByIds<any>(poIds, (chunk) =>
        supabase.from('purchase_orders').select('id, po_number, description').in('id', chunk)
      ),
      fetchByIds<any>(systemIds, (chunk) => supabase.from('systems').select('id, name').in('id', chunk)),
      fetchByIds<any>(deliverableIds, (chunk) => supabase.from('deliverables').select('id, name').in('id', chunk)),
      fetchByIds<any>(activityIds, (chunk) => supabase.from('activities').select('id, name').in('id', chunk)),
    ])

    const sitesMap = byId(sitesRows)
    const posMap = byId(posRows)
    const systemsMap = byId(systemsRows)
    const deliverablesMap = byId(deliverablesRows)
    const activitiesMap = byId(activitiesRows)

    const entriesWithRelations = entries.map((entry: any) => ({
      ...entry,
      sites: entry.client_project_id ? sitesMap[entry.client_project_id] : null,
      purchase_orders: entry.po_id ? posMap[entry.po_id] : null,
      systems: entry.system_id ? systemsMap[entry.system_id] : null,
      deliverables: entry.deliverable_id ? deliverablesMap[entry.deliverable_id] : null,
      activities: entry.activity_id ? activitiesMap[entry.activity_id] : null,
    }))

    const timesheetById = new Map(timesheets.map((t: any) => [t.id, t]))
    const result = ids
      .map((id) => timesheetById.get(id))
      .filter(Boolean)
      .map((timesheet: any) => {
        const timesheetEntries = entriesWithRelations
          .filter((e: any) => e.timesheet_id === timesheet.id)
          .sort(sortEntries)
        const timesheetUnbillable = unbillable
          .filter((u: any) => u.timesheet_id === timesheet.id)
          .sort((a: any, b: any) => String(a.description || '').localeCompare(String(b.description || '')))
        const timesheetSignatures = signatures.filter((s: any) => s.timesheet_id === timesheet.id)

        return {
          timesheet: {
            ...timesheet,
            timesheet_signatures: timesheetSignatures.map((sig: any) => ({
              ...sig,
              user_profiles: sig.user_profiles
            }))
          },
          entries: timesheetEntries,
          unbillable: timesheetUnbillable,
          user: timesheet.user_profiles
        }
      })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error fetching timesheet data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch timesheet data' },
      { status: 500 }
    )
  }
}
