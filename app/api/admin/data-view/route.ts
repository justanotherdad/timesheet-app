import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth'
import { parseISO, format } from 'date-fns'
import { getWeekDates } from '@/lib/utils'

const formatInput = (d: Date) => format(d, 'yyyy-MM-dd')

// Supabase relation can return object or array - extract name safely
const getUserName = (userProfiles: unknown) => {
  const p = Array.isArray(userProfiles) ? (userProfiles as { name?: string }[])[0] : (userProfiles as { name?: string } | null)
  return p?.name || 'N/A'
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

    // Get accessible user IDs based on role (same logic as users page)
    const { data: allProfiles } = await adminSupabase
      .from('user_profiles')
      .select('id, supervisor_id, manager_id, final_approver_id, role')
      .order('name')

    const profiles = (allProfiles || []) as any[]
    const role = user.profile.role

    let accessibleUserIds: string[] = []
    if (role === 'supervisor') {
      accessibleUserIds = profiles
        .filter(
          (p) =>
            (p.supervisor_id === user.id || p.manager_id === user.id || p.final_approver_id === user.id) &&
            p.role === 'employee'
        )
        .map((p) => p.id)
    } else if (role === 'manager') {
      accessibleUserIds = profiles
        .filter(
          (p) =>
            (p.supervisor_id === user.id || p.manager_id === user.id || p.final_approver_id === user.id) &&
            ['employee', 'supervisor'].includes(p.role)
        )
        .map((p) => p.id)
    } else if (role === 'admin') {
      accessibleUserIds = profiles.filter((p) => p.role !== 'super_admin').map((p) => p.id)
    } else {
      accessibleUserIds = profiles.map((p) => p.id)
    }

    // If user filter selected, restrict to that user (if they have access)
    const userIdsToFetch =
      selectedUser && accessibleUserIds.includes(selectedUser)
        ? [selectedUser]
        : accessibleUserIds

    if (userIdsToFetch.length === 0) {
      return NextResponse.json({ timesheets: [], entries: [], unbillable: [], sites: [] })
    }

    // Build timesheet query
    let timesheetQuery = adminSupabase
      .from('weekly_timesheets')
      .select(
        `id, user_id, week_ending, status, user_profiles!user_id (name, email)`
      )
      .in('user_id', userIdsToFetch)

    if (status) timesheetQuery = timesheetQuery.eq('status', status)
    if (startDate && endDate) {
      const startDateObj = parseISO(startDate)
      const weekStart = new Date(startDateObj)
      weekStart.setDate(weekStart.getDate() - 6)
      const endDateObj = parseISO(endDate)
      const weekEnd = new Date(endDateObj)
      weekEnd.setDate(weekEnd.getDate() + 6)
      timesheetQuery = timesheetQuery.gte('week_ending', formatInput(weekStart)).lte('week_ending', formatInput(weekEnd))
    } else if (startDate) {
      const startDateObj = parseISO(startDate)
      const weekStart = new Date(startDateObj)
      weekStart.setDate(weekStart.getDate() - 6)
      timesheetQuery = timesheetQuery.gte('week_ending', formatInput(weekStart))
    } else if (endDate) {
      const endDateObj = parseISO(endDate)
      const weekEnd = new Date(endDateObj)
      weekEnd.setDate(weekEnd.getDate() + 6)
      timesheetQuery = timesheetQuery.lte('week_ending', formatInput(weekEnd))
    }

    const { data: timesheets, error: tsError } = await timesheetQuery
    if (tsError) throw tsError
    if (!timesheets || timesheets.length === 0) {
      return NextResponse.json({ expanded: [], sites: [] })
    }

    const timesheetIds = timesheets.map((t: any) => t.id)

    // Fetch entries and unbillable
    const [entriesResult, unbillableResult, sitesResult] = await Promise.all([
      adminSupabase
        .from('timesheet_entries')
        .select(`
          *,
          systems (name),
          activities (name),
          deliverables (name),
          purchase_orders (po_number, department_id)
        `)
        .in('timesheet_id', timesheetIds),
      adminSupabase.from('timesheet_unbillable').select('*').in('timesheet_id', timesheetIds),
      adminSupabase.from('sites').select('id, name'),
    ])

    if (entriesResult.error) throw entriesResult.error
    if (unbillableResult.error) throw unbillableResult.error

    const entries = (entriesResult.data || []) as any[]
    const unbillable = (unbillableResult.data || []) as any[]
    const sitesList = (sitesResult.data || []) as { id: string; name: string }[]

    // Build unbillable hours per (timesheet_id, date)
    const dayFields = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const
    const unbillableByTimesheetDate: Record<string, number> = {}
    unbillable.forEach((u: any) => {
      const timesheet = timesheets.find((t: any) => t.id === u.timesheet_id)
      if (!timesheet) return
      const weekEnding = parseISO(timesheet.week_ending)
      const weekDates = getWeekDates(weekEnding, 1)
      dayFields.forEach((dayField, dayIndex) => {
        const hrs = u[dayField] || 0
        if (hrs > 0) {
          const dateStr = formatInput(weekDates.days[dayIndex])
          const key = `${timesheet.user_id}:${dateStr}`
          unbillableByTimesheetDate[key] = (unbillableByTimesheetDate[key] || 0) + hrs
        }
      })
    })

    // Expand entries into daily rows
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const expanded: any[] = []

    entries.forEach((entry: any) => {
      const timesheet = timesheets.find((t: any) => t.id === entry.timesheet_id)
      if (!timesheet) return

      const weekEnding = parseISO(timesheet.week_ending)
      const weekDates = getWeekDates(weekEnding, 1)

      dayFields.forEach((dayField, dayIndex) => {
        const hours = entry[dayField] || 0
        if (hours > 0) {
          const dayDate = weekDates.days[dayIndex]
          const dateStr = formatInput(dayDate)
          const unbillableKey = `${timesheet.user_id}:${dateStr}`
          const nonBillableHours = unbillableByTimesheetDate[unbillableKey] || 0

          const siteName = entry.client_project_id
            ? sitesList.find((s) => s.id === entry.client_project_id)?.name || 'N/A'
            : 'N/A'
          const poNumber = entry.purchase_orders?.po_number || 'N/A'

          expanded.push({
            id: `${entry.id}-${dayIndex}`,
            entry_id: entry.id,
            timesheet_id: entry.timesheet_id,
            user_id: timesheet.user_id,
            date: dateStr,
            day: dayNames[dayIndex],
            hours,
            non_billable_hours: nonBillableHours,
            user_name: getUserName(timesheet.user_profiles),
            site_name: siteName,
            po_number: poNumber,
            task_description: entry.task_description || 'N/A',
            system_name: entry.system_name || entry.systems?.name || 'N/A',
            activity_name: entry.activities?.name || 'N/A',
            deliverable_name: entry.deliverables?.name || 'N/A',
            status: timesheet.status || 'N/A',
            week_ending: timesheet.week_ending || '',
            purchase_orders: entry.purchase_orders,
            client_project_id: entry.client_project_id,
          })
        }
      })
    })

    // Add unbillable-only rows (days with unbillable but no billable)
    const billableKeys = new Set(expanded.map((e) => `${e.user_id}:${e.date}`))
    Object.entries(unbillableByTimesheetDate).forEach(([key, hrs]) => {
      if (hrs > 0 && !billableKeys.has(key)) {
        const [userId, dateStr] = key.split(':')
        const timesheet = timesheets.find((t: any) => t.user_id === userId)
        if (!timesheet) return
        const dayName = format(parseISO(dateStr), 'EEE')
        expanded.push({
          id: `unbillable-${timesheet.id}-${dateStr}`,
          entry_id: '',
          timesheet_id: timesheet.id,
          user_id: timesheet.user_id,
          date: dateStr,
          day: dayName,
          hours: 0,
          non_billable_hours: hrs,
          user_name: getUserName(timesheet.user_profiles),
          site_name: 'N/A',
          po_number: 'N/A',
          task_description: 'Unbillable',
          system_name: 'N/A',
          activity_name: 'N/A',
          deliverable_name: 'N/A',
          status: timesheet.status || 'N/A',
          week_ending: timesheet.week_ending || '',
          purchase_orders: null,
          client_project_id: null,
        })
      }
    })

    // Filter by date range
    let filtered = expanded
    if (startDate) filtered = filtered.filter((e) => e.date >= startDate)
    if (endDate) filtered = filtered.filter((e) => e.date <= endDate)
    if (selectedSite) filtered = filtered.filter((e) => e.client_project_id === selectedSite)
    if (selectedDepartment) filtered = filtered.filter((e) => e.purchase_orders?.department_id === selectedDepartment)
    if (selectedPO) {
      filtered = filtered.filter((e) => {
        if (!e.entry_id) return false // unbillable-only rows
        const entry = entries.find((ent: any) => ent.id === e.entry_id)
        return entry?.po_id === selectedPO
      })
    }

    // Sort by date desc
    filtered.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())

    return NextResponse.json({
      expanded: filtered.map(({ purchase_orders, client_project_id, ...rest }) => rest),
      sites: sitesList,
    })
  } catch (error: any) {
    console.error('Data view API error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch data' }, { status: 500 })
  }
}
