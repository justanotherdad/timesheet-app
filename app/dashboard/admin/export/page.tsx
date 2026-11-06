export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchByIds, fetchInIdChunksPaged } from '@/lib/supabase-fetch'
import { currentWeekEnding, getWeekEndingsForMonth } from '@/lib/utils'
import Header from '@/components/Header'
import AdminExport from '@/components/admin/AdminExport'

const PAGE_SIZE = 1000
const TIMESHEET_SELECT = `
  *,
  user_profiles!user_id(name, email, supervisor_id, manager_id, final_approver_id)
`

type ExportSupabase = Awaited<ReturnType<typeof createClient>>

function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function recentBounds(): { start: string; end: string } {
  const end = currentWeekEnding()
  return { start: addCalendarDays(end, -21), end }
}

function boundsForPeriod(periodId: string): { start: string; end: string } {
  if (periodId === 'recent') return recentBounds()
  const [year, month] = periodId.split('-').map(Number)
  const weeks = getWeekEndingsForMonth(year, month, 1)
  if (weeks.length === 0) return recentBounds()
  return { start: weeks[0], end: weeks[weeks.length - 1] }
}

function normalizeRequestedPeriod(raw: string | undefined): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw
  return 'recent'
}

function monthLabel(periodId: string): string {
  const [year, month] = periodId.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

async function listVisibleWeekEndings(supabase: ExportSupabase): Promise<string[]> {
  const dates = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('weekly_timesheets')
      .select('id, week_ending')
      .order('week_ending', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('Export week list failed:', error.message)
      break
    }
    const rows = data || []
    for (const row of rows) {
      const day = String(row.week_ending || '').slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.add(day)
    }
    if (rows.length < PAGE_SIZE) break
  }
  return [...dates]
}

type TimesheetListRow = {
  id: string
  user_id: string
  week_ending: string | null
  status: string
  [key: string]: unknown
}

async function listTimesheetsBetween(supabase: ExportSupabase, start: string, end: string) {
  const out: TimesheetListRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('weekly_timesheets')
      .select(TIMESHEET_SELECT)
      .gte('week_ending', start)
      .lte('week_ending', end)
      .order('week_ending', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.error('Export timesheet list failed:', error.message)
      break
    }
    const rows = (data || []) as TimesheetListRow[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

export default async function AdminExportPage(props: { searchParams?: Promise<{ period?: string }> }) {
  const params = props.searchParams ? await props.searchParams : {}
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const requested = normalizeRequestedPeriod(params.period)
  const requestedBounds = boundsForPeriod(requested)
  const [weekEndingDates, requestedTimesheets] = await Promise.all([
    listVisibleWeekEndings(supabase),
    listTimesheetsBetween(supabase, requestedBounds.start, requestedBounds.end),
  ])

  const monthIds = [...new Set(weekEndingDates.map((day) => day.slice(0, 7)))].sort().reverse()
  const periods = [
    { id: 'recent', label: 'Recent' },
    ...monthIds.map((id) => ({ id, label: monthLabel(id) })),
  ]
  const periodId = periods.some((period) => period.id === requested) ? requested : 'recent'
  const loadedTimesheets = periodId === requested
    ? requestedTimesheets
    : await listTimesheetsBetween(supabase, recentBounds().start, recentBounds().end)
  const timesheets = loadedTimesheets.map((ts) => ({
    ...ts,
    week_ending: String(ts.week_ending || '').slice(0, 10),
  }))

  // Deduplicate: when a user has both a draft and a non-draft for the same week_ending,
  // keep only the highest-precedence one (approved > pending > rejected > draft).
  const STATUS_RANK: Record<string, number> = { approved: 4, pending: 3, rejected: 2, draft: 1 }
  const deduplicatedTimesheets = (() => {
    const seen = new Map<string, any>()
    for (const ts of (timesheets || [])) {
      const key = `${ts.user_id}__${ts.week_ending}`
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, ts)
      } else {
        const existingRank = STATUS_RANK[existing.status] ?? 0
        const newRank = STATUS_RANK[ts.status] ?? 0
        if (newRank > existingRank) seen.set(key, ts)
      }
    }
    return Array.from(seen.values())
  })()

  // Hours / site / PO come from timesheet_entries. Use the admin client and
  // chunk+page the `.in()` so we don't hit PostgREST's URL-length 400 or the
  // silent 1000-row cap (both look like every timesheet has 0 hours / N/A).
  const admin = createAdminClient()
  const timesheetIds = deduplicatedTimesheets.map((ts: any) => ts.id)
  const entriesData = await fetchInIdChunksPaged<any>(timesheetIds, (chunk, from, to) =>
    admin
      .from('timesheet_entries')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours, client_project_id, po_id, system_id, system_name')
      .in('timesheet_id', chunk)
      .order('id', { ascending: true })
      .range(from, to)
  )

  // Calculate total hours for each timesheet and get site/PO info
  const timesheetsWithHours = deduplicatedTimesheets.map((ts: any) => {
    const entries = entriesData.filter((e: any) => e.timesheet_id === ts.id)
    const totalHours = entries.reduce((sum: number, entry: any) => {
      return sum + (Number(entry.mon_hours) || 0) + (Number(entry.tue_hours) || 0) +
             (Number(entry.wed_hours) || 0) + (Number(entry.thu_hours) || 0) +
             (Number(entry.fri_hours) || 0) + (Number(entry.sat_hours) || 0) +
             (Number(entry.sun_hours) || 0)
    }, 0)
    
    const siteIdsForTs = Array.from(new Set(entries.map((e: any) => e.client_project_id).filter(Boolean)))
    const poIdsForTs = Array.from(new Set(entries.map((e: any) => e.po_id).filter(Boolean)))
    const systemIdsForTs = Array.from(new Set(entries.map((e: any) => e.system_id).filter(Boolean)))
    const systemNamesForTs = Array.from(new Set(entries.map((e: any) => e.system_name).filter(Boolean)))

    return {
      ...ts,
      hours: totalHours,
      _site_ids: siteIdsForTs,
      _po_ids: poIdsForTs,
      _system_ids: systemIdsForTs,
      _system_names: systemNamesForTs
    }
  })

  const siteIds = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._site_ids || [])))
  const poIds = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._po_ids || [])))

  const systemIdsFromTs = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._system_ids || [])))
  const customSystemNames = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._system_names || [])))

  const [sitesRows, posRows, systemsRows] = await Promise.all([
    fetchByIds<{ id: string; name: string }>(siteIds as string[], (chunk) =>
      admin.from('sites').select('id, name').in('id', chunk)
    ),
    fetchByIds<{ id: string; po_number: string; site_id?: string; department_id?: string }>(
      poIds as string[],
      (chunk) => admin.from('purchase_orders').select('id, po_number, site_id, department_id').in('id', chunk)
    ),
    fetchByIds<{ id: string; name: string }>(systemIdsFromTs as string[], (chunk) =>
      admin.from('systems').select('id, name').in('id', chunk)
    ),
  ])

  const sitesMap: Record<string, any> = (sitesRows || []).reduce((acc: Record<string, any>, site: any) => {
    acc[site.id] = site
    return acc
  }, {})
  const posMap: Record<string, any> = (posRows || []).reduce((acc: Record<string, any>, po: any) => {
    acc[po.id] = po
    return acc
  }, {})
  const systemsMap: Record<string, any> = (systemsRows || []).reduce((acc: Record<string, any>, s: any) => {
    acc[s.id] = s
    return acc
  }, {})

  // Fetch departments for cascading filters
  const { data: departmentsData } = await supabase
    .from('departments')
    .select('id, name, site_id')
    .order('name')
  const departments = departmentsData || []

  // Build sites and purchaseOrders for AdminExport
  const sites = (siteIds as string[]).map((id) => sitesMap[id]).filter(Boolean)
  const purchaseOrders = (poIds as string[]).map((id) => posMap[id]).filter(Boolean)
  const systems = [
    ...(systemIdsFromTs as string[]).map((id) => systemsMap[id]).filter(Boolean),
    ...(customSystemNames as string[]).map((name) => ({ id: `custom:${name}`, name }))
  ]

  // Add site names, PO names, system names to timesheets (all unique per timesheet)
  const timesheetsWithData = timesheetsWithHours.map((ts: any) => {
    const siteNames = (ts._site_ids || []).map((id: string) => sitesMap[id]?.name).filter(Boolean)
    const poNumbers = (ts._po_ids || []).map((id: string) => posMap[id]?.po_number).filter(Boolean)
    const systemNamesList = [
      ...(ts._system_ids || []).map((id: string) => systemsMap[id]?.name).filter(Boolean),
      ...(ts._system_names || []).filter(Boolean)
    ].filter(Boolean)
    const uniqueSystemNames = Array.from(new Set(systemNamesList))
    return {
      ...ts,
      sitesDisplay: siteNames.length ? siteNames.join(', ') : 'N/A',
      posDisplay: poNumbers.length ? poNumbers.join(', ') : 'N/A',
      systemsDisplay: uniqueSystemNames.length ? uniqueSystemNames.join(', ') : '—',
      _site_ids: ts._site_ids,
      _po_ids: ts._po_ids,
      _system_ids: ts._system_ids,
      _system_names: ts._system_names
    }
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Export Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <AdminExport
            key={periodId}
            timesheets={timesheetsWithData || []}
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
            systems={systems}
            periodId={periodId}
            periods={periods}
          />
        </div>
      </div>
    </div>
  )
}

