import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import { getWeekEndingsForMonth } from '@/lib/utils'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const allMonths = searchParams.get('all') === 'true'

  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let startDate: string
  let endDate: string
  let weekEndings: string[] = []
  let useAllWeeksInMonth = false
  let monthNum = 0
  let yearNum = 0

  if (allMonths) {
    startDate = '2000-01-01'
    endDate = '2100-12-31'
  } else if (month && year) {
    monthNum = parseInt(month, 10)
    yearNum = parseInt(year, 10)
    const firstDay = new Date(yearNum, monthNum - 1, 1)
    const lastDay = new Date(yearNum, monthNum, 0)
    startDate = firstDay.toISOString().split('T')[0]
    endDate = lastDay.toISOString().split('T')[0]
    useAllWeeksInMonth = true
  } else {
    const now = new Date()
    monthNum = now.getMonth() + 1
    yearNum = now.getFullYear()
    const firstDay = new Date(yearNum, monthNum - 1, 1)
    const lastDay = new Date(yearNum, monthNum, 0)
    startDate = firstDay.toISOString().split('T')[0]
    endDate = lastDay.toISOString().split('T')[0]
    useAllWeeksInMonth = true
  }

  if (useAllWeeksInMonth && monthNum && yearNum) {
    const { data: site } = await supabase
      .from('sites')
      .select('week_starting_day')
      .eq('id', po.site_id)
      .single()
    const weekStartsOn = site?.week_starting_day ?? 1
    weekEndings = getWeekEndingsForMonth(yearNum, monthNum, weekStartsOn)
  }

  const { data: timesheets } = await supabase
    .from('weekly_timesheets')
    .select('id, user_id, week_ending')
    .gte('week_ending', startDate)
    .lte('week_ending', endDate)
    .eq('status', 'approved')

  const tsIds = timesheets?.length ? timesheets.map((t: any) => t.id) : []
  const { data: entries } = tsIds.length > 0
    ? await supabase
        .from('timesheet_entries')
        .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
        .eq('po_id', poId)
        .in('timesheet_id', tsIds)
    : { data: [] }

  const hoursByUserWeek: Record<string, Record<string, { hours: number; timesheetId: string }>> = {}
  const weekSet = new Set<string>(weekEndings)

  for (const ts of timesheets || []) {
    const tsEntries = (entries || []).filter((e: any) => e.timesheet_id === ts.id)
    const totalHours = tsEntries.reduce((sum: number, e: any) => {
      return sum + (e.mon_hours || 0) + (e.tue_hours || 0) + (e.wed_hours || 0) +
        (e.thu_hours || 0) + (e.fri_hours || 0) + (e.sat_hours || 0) + (e.sun_hours || 0)
    }, 0)
    if (totalHours > 0) {
      const uid = ts.user_id
      const we = ts.week_ending
      weekSet.add(we)
      if (!hoursByUserWeek[uid]) hoursByUserWeek[uid] = {}
      if (!hoursByUserWeek[uid][we]) {
        hoursByUserWeek[uid][we] = { hours: 0, timesheetId: ts.id }
      }
      hoursByUserWeek[uid][we].hours += totalHours
    }
  }

  if (!useAllWeeksInMonth) {
    weekEndings = Array.from(weekSet).sort()
  } else {
    weekEndings = [...new Set([...weekEndings, ...Array.from(weekSet)])].sort()
  }

  const userIds = Object.keys(hoursByUserWeek)

  const { data: profiles } = userIds.length > 0
    ? await supabase.from('user_profiles').select('id, name').in('id', userIds)
    : { data: [] }

  const profileMap = (profiles || []).reduce((acc: Record<string, string>, p: any) => {
    acc[p.id] = p.name || 'Unknown'
    return acc
  }, {})

  const rows = userIds.map((uid) => {
    const weekData: Record<string, { hours: number; timesheetId: string }> = {}
    let rowTotal = 0
    for (const we of weekEndings) {
      const d = hoursByUserWeek[uid][we]
      const h = d?.hours || 0
      weekData[we] = { hours: h, timesheetId: d?.timesheetId || '' }
      rowTotal += h
    }
    return {
      userId: uid,
      userName: profileMap[uid] || 'Unknown',
      weekData,
      rowTotal,
    }
  })

  const columnTotals: Record<string, number> = {}
  for (const we of weekEndings) {
    columnTotals[we] = rows.reduce((sum, r) => sum + (r.weekData[we]?.hours || 0), 0)
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.rowTotal, 0)

  return NextResponse.json({
    rows,
    weekEndings,
    columnTotals,
    grandTotal,
    monthLabel: month && year ? `${month}/${year}` : null,
    allMonths,
  })
}
