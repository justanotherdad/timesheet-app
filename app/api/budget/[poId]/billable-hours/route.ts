import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

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

  if (allMonths) {
    startDate = '2000-01-01'
    endDate = '2100-12-31'
  } else if (month && year) {
    const m = parseInt(month, 10)
    const y = parseInt(year, 10)
    const firstDay = new Date(y, m - 1, 1)
    const lastDay = new Date(y, m, 0)
    startDate = firstDay.toISOString().split('T')[0]
    endDate = lastDay.toISOString().split('T')[0]
  } else {
    const now = new Date()
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    const firstDay = new Date(y, m - 1, 1)
    const lastDay = new Date(y, m, 0)
    startDate = firstDay.toISOString().split('T')[0]
    endDate = lastDay.toISOString().split('T')[0]
  }

  const { data: timesheets } = await supabase
    .from('weekly_timesheets')
    .select('id, user_id, week_ending')
    .gte('week_ending', startDate)
    .lte('week_ending', endDate)
    .eq('status', 'approved')

  if (!timesheets?.length) {
    return NextResponse.json({
      rows: [],
      weekEndings: [],
      monthLabel: month && year ? `${month}/${year}` : null,
    })
  }

  const tsIds = timesheets.map((t: any) => t.id)
  const { data: entries } = await supabase
    .from('timesheet_entries')
    .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
    .eq('po_id', poId)
    .in('timesheet_id', tsIds)

  const hoursByUserWeek: Record<string, Record<string, { hours: number; timesheetId: string }>> = {}
  const weekSet = new Set<string>()

  for (const ts of timesheets) {
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

  const weekEndings = Array.from(weekSet).sort()
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
