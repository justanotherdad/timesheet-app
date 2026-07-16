import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { getAccessibleSiteIds } from '@/lib/access'
import { parseISO, format } from 'date-fns'

const formatInput = (d: Date) => format(d, 'yyyy-MM-dd')

const getUserName = (userProfiles: unknown) => {
  const p = Array.isArray(userProfiles)
    ? (userProfiles as { name?: string }[])[0]
    : (userProfiles as { name?: string } | null)
  return p?.name || 'N/A'
}

const dayFields = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const
const sumHours = (obj: Record<string, unknown>) =>
  dayFields.reduce((s, f) => s + (Number(obj[f]) || 0), 0)

const IN_CHUNK_SIZE = 150

/**
 * Run an `.in(column, ids)` query in chunks so a large id list doesn't blow
 * past PostgREST's URL/filter length limit (which surfaces as "Bad Request").
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

type ExpandedRow = {
  id: string
  entry_id: string
  timesheet_id: string
  user_id: string
  hours: number
  non_billable_hours: number
  user_name: string
  site_name: string
  site_id: string | null
  po_number: string
  po_id: string | null
  department_id: string | null
  task_description: string
  system_name: string
  activity_name: string
  deliverable_name: string
  status: string
  week_ending: string
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
    const adminSupabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const selectedUser = searchParams.get('user') || ''
    const selectedSite = searchParams.get('site') || ''
    const selectedDepartment = searchParams.get('department') || ''
    const selectedPO = searchParams.get('po') || ''
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const status = searchParams.get('status') || ''

    const { data: allProfiles } = await adminSupabase
      .from('user_profiles')
      .select('id, name, supervisor_id, manager_id, final_approver_id, role')
      .order('name')

    const profiles = (allProfiles || []) as Array<{
      id: string
      name: string
      supervisor_id?: string | null
      manager_id?: string | null
      final_approver_id?: string | null
      role: string
    }>
    const role = user.profile.role

    let accessibleUserIds: string[] = []
    if (role === 'supervisor') {
      accessibleUserIds = profiles
        .filter(
          (p) =>
            (p.supervisor_id === user.id ||
              p.manager_id === user.id ||
              p.final_approver_id === user.id) &&
            p.role === 'employee'
        )
        .map((p) => p.id)
    } else if (role === 'manager') {
      accessibleUserIds = profiles
        .filter(
          (p) =>
            (p.supervisor_id === user.id ||
              p.manager_id === user.id ||
              p.final_approver_id === user.id) &&
            ['employee', 'supervisor'].includes(p.role)
        )
        .map((p) => p.id)
    } else if (role === 'admin') {
      accessibleUserIds = profiles.filter((p) => p.role !== 'super_admin').map((p) => p.id)
    } else {
      accessibleUserIds = profiles.map((p) => p.id)
    }

    const accessibleSiteIds = await getAccessibleSiteIds(adminSupabase, user.id, role)
    const siteScopeSet =
      accessibleSiteIds === null ? null : new Set(accessibleSiteIds)

    const userIdsToFetch =
      selectedUser && accessibleUserIds.includes(selectedUser)
        ? [selectedUser]
        : accessibleUserIds

    if (userIdsToFetch.length === 0) {
      return NextResponse.json({
        expanded: [],
        filterOptions: { users: [], sites: [], departments: [], purchaseOrders: [] },
      })
    }

    let weekStartBound: string | null = null
    let weekEndBound: string | null = null
    if (startDate) {
      const weekStart = new Date(parseISO(startDate))
      weekStart.setDate(weekStart.getDate() - 6)
      weekStartBound = formatInput(weekStart)
    }
    if (endDate) {
      const weekEnd = new Date(parseISO(endDate))
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEndBound = formatInput(weekEnd)
    }

    type TimesheetRow = {
      id: string
      user_id: string
      week_ending: string
      status: string
      user_profiles: unknown
    }

    const timesheets = await fetchByIdsInChunks<TimesheetRow>(userIdsToFetch, (chunk) => {
      let q = adminSupabase
        .from('weekly_timesheets')
        .select(`id, user_id, week_ending, status, user_profiles!user_id (name, email)`)
        .in('user_id', chunk)
      if (status) q = q.eq('status', status)
      if (weekStartBound) q = q.gte('week_ending', weekStartBound)
      if (weekEndBound) q = q.lte('week_ending', weekEndBound)
      return q
    })

    if (!timesheets || timesheets.length === 0) {
      return NextResponse.json({
        expanded: [],
        filterOptions: { users: [], sites: [], departments: [], purchaseOrders: [] },
      })
    }

    const timesheetIds = timesheets.map((t) => t.id)

    const [entries, unbillable] = await Promise.all([
      fetchByIdsInChunks<Record<string, unknown>>(timesheetIds, (chunk) =>
        adminSupabase.from('timesheet_entries').select('*').in('timesheet_id', chunk)
      ),
      fetchByIdsInChunks<Record<string, unknown>>(timesheetIds, (chunk) =>
        adminSupabase.from('timesheet_unbillable').select('*').in('timesheet_id', chunk)
      ),
    ])

    const poIds = [...new Set(entries.map((e) => e.po_id as string).filter(Boolean))]
    const siteIdsFromEntries = [...new Set(entries.map((e) => e.client_project_id as string).filter(Boolean))]
    const systemIds = [...new Set(entries.map((e) => e.system_id as string).filter(Boolean))]
    const activityIds = [...new Set(entries.map((e) => e.activity_id as string).filter(Boolean))]
    const deliverableIds = [...new Set(entries.map((e) => e.deliverable_id as string).filter(Boolean))]

    const [posRows, sitesRows, systemsRows, activitiesRows, deliverablesRows, allSitesResult, allDeptsResult] =
      await Promise.all([
        fetchByIdsInChunks<{ id: string; po_number: string; site_id?: string; department_id?: string }>(
          poIds,
          (chunk) =>
            adminSupabase.from('purchase_orders').select('id, po_number, site_id, department_id').in('id', chunk)
        ),
        fetchByIdsInChunks<{ id: string; name: string }>(siteIdsFromEntries, (chunk) =>
          adminSupabase.from('sites').select('id, name').in('id', chunk)
        ),
        fetchByIdsInChunks<{ id: string; name: string }>(systemIds, (chunk) =>
          adminSupabase.from('systems').select('id, name').in('id', chunk)
        ),
        fetchByIdsInChunks<{ id: string; name: string }>(activityIds, (chunk) =>
          adminSupabase.from('activities').select('id, name').in('id', chunk)
        ),
        fetchByIdsInChunks<{ id: string; name: string }>(deliverableIds, (chunk) =>
          adminSupabase.from('deliverables').select('id, name').in('id', chunk)
        ),
        adminSupabase.from('sites').select('id, name').order('name'),
        adminSupabase.from('departments').select('id, name, site_id').order('name'),
      ])

    const posMap = Object.fromEntries(posRows.map((p) => [p.id, p]))
    const sitesMap = Object.fromEntries(sitesRows.map((s) => [s.id, s]))
    const systemsMap = Object.fromEntries(systemsRows.map((s) => [s.id, s]))
    const activitiesMap = Object.fromEntries(activitiesRows.map((s) => [s.id, s]))
    const deliverablesMap = Object.fromEntries(deliverablesRows.map((s) => [s.id, s]))

    const expanded: ExpandedRow[] = []

    for (const entry of entries) {
      const timesheet = timesheets.find((t: { id: string }) => t.id === entry.timesheet_id)
      if (!timesheet) continue

      const hours = sumHours(entry)
      const po = entry.po_id ? posMap[entry.po_id as string] : undefined
      const siteId = (entry.client_project_id as string) || po?.site_id || null

      if (siteScopeSet !== null && siteId && !siteScopeSet.has(siteId)) continue

      const siteName = siteId ? sitesMap[siteId]?.name || 'N/A' : 'N/A'

      expanded.push({
        id: entry.id as string,
        entry_id: entry.id as string,
        timesheet_id: entry.timesheet_id as string,
        user_id: timesheet.user_id,
        hours,
        non_billable_hours: 0,
        user_name: getUserName(timesheet.user_profiles),
        site_name: siteName,
        site_id: siteId,
        po_number: po?.po_number || 'N/A',
        po_id: (entry.po_id as string) || null,
        department_id: po?.department_id || null,
        task_description: (entry.task_description as string) || 'N/A',
        system_name: (entry.system_name as string) || systemsMap[entry.system_id as string]?.name || 'N/A',
        activity_name: activitiesMap[entry.activity_id as string]?.name || 'N/A',
        deliverable_name: deliverablesMap[entry.deliverable_id as string]?.name || 'N/A',
        status: timesheet.status || 'N/A',
        week_ending: timesheet.week_ending || '',
      })
    }

    for (const u of unbillable) {
      const timesheet = timesheets.find((t: { id: string }) => t.id === u.timesheet_id)
      if (!timesheet) continue
      const nonBillableHours = sumHours(u)
      if (nonBillableHours <= 0) continue

      expanded.push({
        id: `unbillable-${u.id}`,
        entry_id: '',
        timesheet_id: timesheet.id,
        user_id: timesheet.user_id,
        hours: 0,
        non_billable_hours: nonBillableHours,
        user_name: getUserName(timesheet.user_profiles),
        site_name: 'N/A',
        site_id: null,
        po_number: 'N/A',
        po_id: null,
        department_id: null,
        task_description: (u.description as string) || 'Unbillable',
        system_name: 'N/A',
        activity_name: 'N/A',
        deliverable_name: 'N/A',
        status: timesheet.status || 'N/A',
        week_ending: timesheet.week_ending || '',
      })
    }

    let filtered = expanded
    if (startDate) filtered = filtered.filter((e) => e.week_ending >= startDate)
    if (endDate) {
      const endPlus6 = new Date(parseISO(endDate))
      endPlus6.setDate(endPlus6.getDate() + 6)
      filtered = filtered.filter((e) => e.week_ending <= formatInput(endPlus6))
    }

    const matchesExcept = (
      row: ExpandedRow,
      skip: 'user' | 'site' | 'department' | 'po'
    ) => {
      if (skip !== 'user' && selectedUser && row.user_id !== selectedUser) return false
      if (skip !== 'site' && selectedSite) {
        if (row.entry_id && row.site_id !== selectedSite) return false
        if (!row.entry_id && selectedSite) return false
      }
      if (skip !== 'department' && selectedDepartment) {
        if (row.entry_id && row.department_id !== selectedDepartment) return false
        if (!row.entry_id && selectedDepartment) return false
      }
      if (skip !== 'po' && selectedPO) {
        if (row.entry_id && row.po_id !== selectedPO) return false
        if (!row.entry_id && selectedPO) return false
      }
      return true
    }

    const allSites = (allSitesResult.data || []) as Array<{ id: string; name: string }>
    const allDepts = (allDeptsResult.data || []) as Array<{ id: string; name: string; site_id: string }>
    const scopedSites =
      siteScopeSet === null ? allSites : allSites.filter((s) => siteScopeSet.has(s.id))
    const scopedSiteIdSet = new Set(scopedSites.map((s) => s.id))
    const scopedDepts = allDepts.filter((d) => scopedSiteIdSet.has(d.site_id))

    let scopedPos: Array<{ id: string; po_number: string; site_id?: string; department_id?: string }> = []
    if (siteScopeSet === null) {
      const { data: allPos } = await adminSupabase
        .from('purchase_orders')
        .select('id, po_number, site_id, department_id')
        .order('po_number')
      scopedPos = (allPos || []) as typeof scopedPos
    } else if (scopedSiteIdSet.size > 0) {
      const { data: sitePos } = await adminSupabase
        .from('purchase_orders')
        .select('id, po_number, site_id, department_id')
        .in('site_id', [...scopedSiteIdSet])
        .order('po_number')
      scopedPos = (sitePos || []) as typeof scopedPos
    }

    const accessibleUsers = profiles
      .filter((p) => accessibleUserIds.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name }))

    const userIdsInPool = new Set(
      filtered.filter((r) => matchesExcept(r, 'user')).map((r) => r.user_id)
    )
    const siteIdsInPool = new Set(
      filtered
        .filter((r) => matchesExcept(r, 'site') && r.site_id)
        .map((r) => r.site_id as string)
    )
    const deptIdsInPool = new Set(
      filtered
        .filter((r) => matchesExcept(r, 'department') && r.department_id)
        .map((r) => r.department_id as string)
    )
    const poIdsInPool = new Set(
      filtered.filter((r) => matchesExcept(r, 'po') && r.po_id).map((r) => r.po_id as string)
    )

    const filterOptions = {
      users: accessibleUsers.filter((u) => userIdsInPool.has(u.id)),
      sites: scopedSites.filter((s) => siteIdsInPool.size === 0 || siteIdsInPool.has(s.id)),
      departments: scopedDepts.filter((d) => deptIdsInPool.size === 0 || deptIdsInPool.has(d.id)),
      purchaseOrders: scopedPos.filter((p) => poIdsInPool.size === 0 || poIdsInPool.has(p.id)),
    }

    if (selectedUser) filtered = filtered.filter((e) => e.user_id === selectedUser)
    // Site / Department / PO filters target billable entries. Unbillable rows
    // (HOLIDAY/PTO, entry_id === '') have no site/PO, so they must be excluded
    // whenever one of these filters is active — otherwise they leak through as
    // "N/A" rows even though they don't belong to the selected site/PO.
    if (selectedSite) {
      filtered = filtered.filter((e) => e.entry_id !== '' && e.site_id === selectedSite)
    }
    if (selectedDepartment) {
      filtered = filtered.filter((e) => e.entry_id !== '' && e.department_id === selectedDepartment)
    }
    if (selectedPO) {
      filtered = filtered.filter((e) => e.entry_id !== '' && e.po_id === selectedPO)
    }

    filtered.sort((a, b) => {
      const weekCmp = parseISO(b.week_ending).getTime() - parseISO(a.week_ending).getTime()
      if (weekCmp !== 0) return weekCmp
      const userCmp = (a.user_name || '').localeCompare(b.user_name || '')
      if (userCmp !== 0) return userCmp
      return (a.task_description || '').localeCompare(b.task_description || '')
    })

    return NextResponse.json({
      expanded: filtered.map(({ site_id, po_id, department_id, user_id, ...rest }) => rest),
      filterOptions,
    })
  } catch (error: unknown) {
    console.error('Data view API error:', error)
    let message = 'Failed to fetch data'
    if (error instanceof Error) message = error.message
    else if (error && typeof error === 'object' && 'message' in error) {
      message = String((error as { message: unknown }).message)
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
